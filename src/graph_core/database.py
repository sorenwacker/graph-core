"""SQLite database operations for nodes."""

import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from .models import Node, NodeCreate, NodeUpdate, NodeType


class Database:
    """SQLite database for node storage."""

    def __init__(self, db_path: str = "graph.db"):
        self.db_path = Path(db_path)
        self.conn: Optional[sqlite3.Connection] = None
        self._lock = threading.Lock()

    def connect(self) -> None:
        """Connect to the database."""
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def close(self) -> None:
        """Close the database connection."""
        if self.conn:
            self.conn.close()
            self.conn = None

    def _init_schema(self) -> None:
        """Initialize the database schema."""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL DEFAULT 'task',
                title TEXT NOT NULL,
                parent_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
                depth INTEGER DEFAULT 0,
                path TEXT DEFAULT '',
                notes TEXT DEFAULT '',
                completed INTEGER DEFAULT 0,
                color TEXT,
                sort_order INTEGER DEFAULT 0,
                importance INTEGER,
                start_date TEXT,
                end_date TEXT,
                due_date TEXT,
                -- Person-specific fields
                email TEXT,
                phone TEXT,
                organization TEXT,
                role TEXT,
                address TEXT,
                website TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id);
            CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
            CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path);
            CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at);

            CREATE TABLE IF NOT EXISTS node_links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                link_type TEXT DEFAULT 'related',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(source_id, target_id)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#3498db',
                symbol TEXT DEFAULT '*',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS statuses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT DEFAULT '#3498db',
                sort_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Add category_id and status_id columns to nodes if not exist
        try:
            self.conn.execute("ALTER TABLE nodes ADD COLUMN category_id INTEGER REFERENCES categories(id)")
        except:
            pass
        try:
            self.conn.execute("ALTER TABLE nodes ADD COLUMN status_id INTEGER REFERENCES statuses(id)")
        except:
            pass
        try:
            self.conn.execute("ALTER TABLE nodes ADD COLUMN notes_sensitive INTEGER DEFAULT 0")
        except:
            pass
        self.conn.commit()

    def _row_to_node(self, row: sqlite3.Row) -> Node:
        """Convert a database row to a Node object."""
        keys = row.keys()
        return Node(
            id=row["id"],
            type=NodeType(row["type"]),
            title=row["title"],
            parent_id=row["parent_id"],
            depth=row["depth"],
            path=row["path"] or "",
            notes=row["notes"] or "",
            notes_sensitive=bool(row["notes_sensitive"]) if "notes_sensitive" in keys else False,
            completed=bool(row["completed"]),
            color=row["color"],
            sort_order=row["sort_order"],
            importance=row["importance"],
            start_date=row["start_date"],
            end_date=row["end_date"],
            due_date=row["due_date"],
            # Person-specific fields
            email=row["email"] if "email" in keys else None,
            phone=row["phone"] if "phone" in keys else None,
            organization=row["organization"] if "organization" in keys else None,
            role=row["role"] if "role" in keys else None,
            address=row["address"] if "address" in keys else None,
            website=row["website"] if "website" in keys else None,
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            deleted_at=datetime.fromisoformat(row["deleted_at"]) if row["deleted_at"] else None,
        )

    def _update_path_and_depth(self, node_id: int) -> None:
        """Update path and depth for a node and all its descendants."""
        cursor = self.conn.execute("SELECT parent_id FROM nodes WHERE id = ?", (node_id,))
        row = cursor.fetchone()
        if not row:
            return

        parent_id = row["parent_id"]
        if parent_id:
            cursor = self.conn.execute(
                "SELECT path, depth FROM nodes WHERE id = ?", (parent_id,)
            )
            parent = cursor.fetchone()
            path = f"{parent['path']}/{node_id}" if parent["path"] else str(node_id)
            depth = parent["depth"] + 1
        else:
            path = str(node_id)
            depth = 0

        self.conn.execute(
            "UPDATE nodes SET path = ?, depth = ? WHERE id = ?",
            (path, depth, node_id),
        )

        # Recursively update all descendants
        cursor = self.conn.execute(
            "SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL",
            (node_id,)
        )
        for child_row in cursor.fetchall():
            self._update_path_and_depth(child_row["id"])

    # CRUD Operations

    def create_node(self, node: NodeCreate) -> Node:
        """Create a new node."""
        now = datetime.now().isoformat()
        cursor = self.conn.execute(
            """
            INSERT INTO nodes (type, title, parent_id, notes, notes_sensitive, completed, color,
                             sort_order, importance, start_date, end_date, due_date,
                             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                node.type.value,
                node.title,
                node.parent_id,
                node.notes,
                int(node.notes_sensitive),
                int(node.completed),
                node.color,
                node.sort_order,
                node.importance,
                node.start_date,
                node.end_date,
                node.due_date,
                now,
                now,
            ),
        )
        self.conn.commit()
        node_id = cursor.lastrowid
        self._update_path_and_depth(node_id)
        self.conn.commit()
        return self.get_node(node_id)

    def get_node(self, node_id: int) -> Optional[Node]:
        """Get a node by ID."""
        with self._lock:
            cursor = self.conn.execute(
                "SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL", (node_id,)
            )
            row = cursor.fetchone()
        return self._row_to_node(row) if row else None

    def get_nodes(
        self,
        node_type: Optional[NodeType] = None,
        parent_id: Optional[int] = None,
        include_deleted: bool = False,
    ) -> list[Node]:
        """Get nodes with optional filters."""
        query = "SELECT * FROM nodes WHERE 1=1"
        params = []

        if not include_deleted:
            query += " AND deleted_at IS NULL"
        if node_type:
            query += " AND type = ?"
            params.append(node_type.value)
        if parent_id is not None:
            query += " AND parent_id = ?"
            params.append(parent_id)

        query += " ORDER BY sort_order, created_at"
        with self._lock:
            cursor = self.conn.execute(query, params)
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def get_children(
        self, parent_id: int, node_type: Optional[NodeType] = None
    ) -> list[Node]:
        """Get direct children of a node."""
        query = "SELECT * FROM nodes WHERE parent_id = ? AND deleted_at IS NULL"
        params = [parent_id]

        if node_type:
            query += " AND type = ?"
            params.append(node_type.value)

        query += " ORDER BY sort_order, created_at"
        with self._lock:
            cursor = self.conn.execute(query, params)
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def get_descendants(
        self, parent_id: int, max_depth: Optional[int] = None
    ) -> list[Node]:
        """Get all descendants of a node using path prefix matching."""
        parent = self.get_node(parent_id)
        if not parent:
            return []

        query = """
            SELECT * FROM nodes
            WHERE (path LIKE ? OR path LIKE ?)
            AND deleted_at IS NULL
        """
        params = [f"{parent.path}/%", f"%/{parent_id}/%"]

        if max_depth is not None:
            query += " AND depth <= ?"
            params.append(parent.depth + max_depth)

        query += " ORDER BY depth, sort_order, created_at"
        with self._lock:
            cursor = self.conn.execute(query, params)
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def get_ancestors(self, node_id: int) -> list[Node]:
        """Get all ancestors of a node."""
        node = self.get_node(node_id)
        if not node or not node.path:
            return []

        ancestor_ids = [int(x) for x in node.path.split("/")[:-1] if x]
        if not ancestor_ids:
            return []

        placeholders = ",".join("?" * len(ancestor_ids))
        with self._lock:
            cursor = self.conn.execute(
                f"SELECT * FROM nodes WHERE id IN ({placeholders}) ORDER BY depth",
                ancestor_ids,
            )
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def get_root_nodes(self, node_type: Optional[NodeType] = None) -> list[Node]:
        """Get nodes without parents."""
        query = "SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL"
        params = []

        if node_type:
            query += " AND type = ?"
            params.append(node_type.value)

        query += " ORDER BY sort_order, created_at"
        with self._lock:
            cursor = self.conn.execute(query, params)
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def update_node(self, node_id: int, update: NodeUpdate) -> Optional[Node]:
        """Update a node."""
        updates = []
        params = []

        for field, value in update.model_dump(exclude_unset=True).items():
            if field == "type" and value:
                value = value.value
            if field == "completed":
                value = int(value)
            if field == "notes_sensitive":
                value = int(value)
            updates.append(f"{field} = ?")
            params.append(value)

        if not updates:
            return self.get_node(node_id)

        updates.append("updated_at = ?")
        params.append(datetime.now().isoformat())
        params.append(node_id)

        self.conn.execute(
            f"UPDATE nodes SET {', '.join(updates)} WHERE id = ?", params
        )
        self.conn.commit()

        # Update path if parent changed
        if update.parent_id is not None:
            self._update_path_and_depth(node_id)
            self.conn.commit()

        return self.get_node(node_id)

    def delete_node(self, node_id: int, hard: bool = False) -> bool:
        """Delete a node (soft delete by default)."""
        if hard:
            self.conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
        else:
            self.conn.execute(
                "UPDATE nodes SET deleted_at = ? WHERE id = ?",
                (datetime.now().isoformat(), node_id),
            )
        self.conn.commit()
        return True

    def move_node(self, node_id: int, new_parent_id: Optional[int]) -> Optional[Node]:
        """Move a node to a new parent."""
        return self.update_node(node_id, NodeUpdate(parent_id=new_parent_id))

    # Link Operations

    def link_nodes(self, source_id: int, target_id: int, link_type: str = "related") -> bool:
        """Create a link between two nodes."""
        try:
            self.conn.execute(
                "INSERT INTO node_links (source_id, target_id, link_type) VALUES (?, ?, ?)",
                (source_id, target_id, link_type),
            )
            self.conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False

    def unlink_nodes(self, source_id: int, target_id: int) -> bool:
        """Remove a link between two nodes."""
        self.conn.execute(
            "DELETE FROM node_links WHERE source_id = ? AND target_id = ?",
            (source_id, target_id),
        )
        self.conn.commit()
        return True

    def get_linked_nodes(self, node_id: int) -> list[Node]:
        """Get all nodes linked to a given node."""
        cursor = self.conn.execute(
            """
            SELECT n.* FROM nodes n
            WHERE n.id IN (
                SELECT target_id FROM node_links WHERE source_id = ?
                UNION
                SELECT source_id FROM node_links WHERE target_id = ?
            )
            AND n.deleted_at IS NULL
            """,
            (node_id, node_id),
        )
        return [self._row_to_node(row) for row in cursor.fetchall()]

    def search_nodes(self, query: str, node_type: Optional[NodeType] = None) -> list[Node]:
        """Search nodes by title or notes."""
        search_pattern = f"%{query}%"
        sql = """
            SELECT * FROM nodes
            WHERE deleted_at IS NULL
            AND (title LIKE ? OR notes LIKE ?)
        """
        params = [search_pattern, search_pattern]

        if node_type:
            sql += " AND type = ?"
            params.append(node_type.value)

        sql += " ORDER BY updated_at DESC LIMIT 50"

        with self._lock:
            cursor = self.conn.execute(sql, params)
            rows = cursor.fetchall()
        return [self._row_to_node(row) for row in rows]

    def reorder_node(self, node_id: int, target_id: int, position: str) -> Optional[Node]:
        """Reorder a node relative to a target node.

        Args:
            node_id: The node to move
            target_id: The reference node
            position: 'before' or 'after' the target
        """
        with self._lock:
            # Get the target node to find its parent and sort_order
            cursor = self.conn.execute(
                "SELECT parent_id, sort_order FROM nodes WHERE id = ?", (target_id,)
            )
            target = cursor.fetchone()
            if not target:
                return None

            target_parent_id = target["parent_id"]
            target_sort = target["sort_order"] or 0

            # Get all siblings (nodes with same parent), ordered by sort_order
            if target_parent_id is None:
                cursor = self.conn.execute(
                    "SELECT id, sort_order FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, id"
                )
            else:
                cursor = self.conn.execute(
                    "SELECT id, sort_order FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, id",
                    (target_parent_id,)
                )
            siblings = cursor.fetchall()

            # Find target position and calculate new sort_order
            target_idx = None
            for i, sib in enumerate(siblings):
                if sib["id"] == target_id:
                    target_idx = i
                    break

            if target_idx is None:
                return None

            # Calculate new sort order
            if position == 'before':
                if target_idx == 0:
                    new_sort = target_sort - 1000
                else:
                    prev_sort = siblings[target_idx - 1]["sort_order"] or 0
                    new_sort = (prev_sort + target_sort) / 2
            else:  # after
                if target_idx == len(siblings) - 1:
                    new_sort = target_sort + 1000
                else:
                    next_sort = siblings[target_idx + 1]["sort_order"] or 0
                    new_sort = (target_sort + next_sort) / 2

            # Update the node
            now = datetime.now().isoformat()
            self.conn.execute(
                "UPDATE nodes SET parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?",
                (target_parent_id, new_sort, now, node_id)
            )
            self.conn.commit()

            # Update path if parent changed
            self._update_path_and_depth(node_id)
            self.conn.commit()

        return self.get_node(node_id)
