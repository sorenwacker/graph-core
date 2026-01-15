#!/usr/bin/env python3
"""
Migration script: my-todo-list -> graph-core

Migrates data from the old multi-table app to the unified node-based graph structure.
"""

import sqlite3
from datetime import datetime
from pathlib import Path

# Paths
OLD_DB = Path("/Users/sdrwacker/Library/Application Support/todo/todos.db")
NEW_DB = Path("/Users/sdrwacker/workspace/graph-core/graph.db")

# Track ID mappings for relationships
id_map = {
    'projects': {},      # old_id -> new_node_id
    'todos': {},         # old_id -> new_node_id
    'subtasks': {},      # old_id -> new_node_id
    'topics': {},        # old_id -> new_node_id
    'persons': {},       # old_id -> new_node_id
    'categories': {},    # old_id -> new_id
    'statuses': {},      # old_id -> new_id
}


def get_old_connection():
    """Connect to old database."""
    if not OLD_DB.exists():
        raise FileNotFoundError(f"Old database not found: {OLD_DB}")
    return sqlite3.connect(OLD_DB)


def get_new_connection():
    """Connect to new database."""
    if not NEW_DB.exists():
        raise FileNotFoundError(f"New database not found: {NEW_DB}")
    return sqlite3.connect(NEW_DB)


def clear_new_database(new_conn):
    """Clear existing data in new database."""
    cursor = new_conn.cursor()
    print("Clearing existing data in new database...")
    cursor.execute("DELETE FROM node_links")
    cursor.execute("DELETE FROM nodes")
    cursor.execute("DELETE FROM categories")
    cursor.execute("DELETE FROM statuses")
    new_conn.commit()
    print("  Done.")


def migrate_categories(old_conn, new_conn):
    """Migrate categories table."""
    print("Migrating categories...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("SELECT id, name, color, symbol, sort_order, created_at FROM categories")
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, name, color, symbol, sort_order, created_at = row
        new_cursor.execute("""
            INSERT INTO categories (name, color, symbol, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (name, color, symbol, sort_order, created_at))
        id_map['categories'][old_id] = new_cursor.lastrowid

    new_conn.commit()
    print(f"  Migrated {len(rows)} categories.")


def migrate_statuses(old_conn, new_conn):
    """Migrate statuses table."""
    print("Migrating statuses...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("SELECT id, name, color, sort_order, created_at FROM statuses")
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, name, color, sort_order, created_at = row
        new_cursor.execute("""
            INSERT INTO statuses (name, color, sort_order, created_at)
            VALUES (?, ?, ?, ?)
        """, (name, color, sort_order, created_at))
        id_map['statuses'][old_id] = new_cursor.lastrowid

    new_conn.commit()
    print(f"  Migrated {len(rows)} statuses.")


def migrate_persons(old_conn, new_conn):
    """Migrate persons to nodes with type='person'."""
    print("Migrating persons...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("""
        SELECT id, name, email, phone, company, role, github_name, notes, color, sort_order, created_at
        FROM persons
    """)
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, name, email, phone, company, role, github_name, notes, color, sort_order, created_at = row

        # Build notes with person details
        person_notes = []
        if email:
            person_notes.append(f"Email: {email}")
        if phone:
            person_notes.append(f"Phone: {phone}")
        if company:
            person_notes.append(f"Company: {company}")
        if role:
            person_notes.append(f"Role: {role}")
        if github_name:
            person_notes.append(f"GitHub: {github_name}")
        if notes:
            person_notes.append(f"\n{notes}")

        combined_notes = "\n".join(person_notes) if person_notes else None

        new_cursor.execute("""
            INSERT INTO nodes (type, title, notes, color, sort_order, created_at, updated_at, depth, path)
            VALUES ('person', ?, ?, ?, ?, ?, ?, 0, '')
        """, (name, combined_notes, color, sort_order, created_at, created_at))
        id_map['persons'][old_id] = new_cursor.lastrowid

    new_conn.commit()
    print(f"  Migrated {len(rows)} persons.")


def migrate_projects(old_conn, new_conn):
    """Migrate projects to nodes with type='project'."""
    print("Migrating projects...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("""
        SELECT id, name, color, sort_order, created_at, deleted_at
        FROM projects
    """)
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, name, color, sort_order, created_at, deleted_at = row

        new_cursor.execute("""
            INSERT INTO nodes (type, title, color, sort_order, created_at, updated_at, deleted_at, depth, path)
            VALUES ('project', ?, ?, ?, ?, ?, ?, 0, '')
        """, (name, color, sort_order, created_at, created_at, deleted_at))
        new_id = new_cursor.lastrowid
        id_map['projects'][old_id] = new_id

        # Update path to include own ID
        new_cursor.execute("UPDATE nodes SET path = ? WHERE id = ?", (str(new_id), new_id))

    new_conn.commit()
    print(f"  Migrated {len(rows)} projects.")


def migrate_topics(old_conn, new_conn):
    """Migrate project_topics to nodes with type='topic'."""
    print("Migrating topics...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("""
        SELECT id, project_id, name, color, sort_order, created_at
        FROM project_topics
    """)
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, project_id, name, color, sort_order, created_at = row

        # Get new parent project ID
        new_parent_id = id_map['projects'].get(project_id)
        if not new_parent_id:
            print(f"  Warning: Topic {old_id} has invalid project_id {project_id}, skipping.")
            continue

        # Get parent path
        new_cursor.execute("SELECT path FROM nodes WHERE id = ?", (new_parent_id,))
        parent_path = new_cursor.fetchone()[0] or ''

        new_cursor.execute("""
            INSERT INTO nodes (type, title, color, sort_order, parent_id, depth, created_at, updated_at, path)
            VALUES ('topic', ?, ?, ?, ?, 1, ?, ?, '')
        """, (name, color, sort_order, new_parent_id, created_at, created_at))
        new_id = new_cursor.lastrowid
        id_map['topics'][old_id] = new_id

        # Update path
        new_path = f"{parent_path}/{new_id}" if parent_path else str(new_id)
        new_cursor.execute("UPDATE nodes SET path = ? WHERE id = ?", (new_path, new_id))

    new_conn.commit()
    print(f"  Migrated {len(rows)} topics.")


def migrate_todos(old_conn, new_conn):
    """Migrate todos to nodes."""
    print("Migrating todos...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("""
        SELECT id, title, notes, notes_sensitive, completed, sort_order, importance,
               project_id, category_id, status_id, topic_id, parent_id,
               type, start_date, end_date, due_date, milestone_date,
               recurrence_type, recurrence_interval, recurrence_end_date,
               created_at, updated_at, deleted_at
        FROM todos
    """)
    rows = old_cursor.fetchall()

    # First pass: create all todos without parent relationships
    for row in rows:
        (old_id, title, notes, notes_sensitive, completed, sort_order, importance,
         project_id, category_id, status_id, topic_id, parent_id,
         type_, start_date, end_date, due_date, milestone_date,
         recurrence_type, recurrence_interval, recurrence_end_date,
         created_at, updated_at, deleted_at) = row

        # Map type (task, note, milestone) - convert todo to task
        if type_ == 'todo':
            node_type = 'task'
        elif type_ in ('note', 'milestone'):
            node_type = type_
        else:
            node_type = 'task'

        # Map category and status
        new_category_id = id_map['categories'].get(category_id)
        new_status_id = id_map['statuses'].get(status_id)

        new_cursor.execute("""
            INSERT INTO nodes (type, title, notes, notes_sensitive, completed, sort_order, importance,
                             category_id, status_id, start_date, end_date, due_date,
                             created_at, updated_at, deleted_at, depth, path)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '')
        """, (node_type, title, notes, notes_sensitive, completed, sort_order, importance,
              new_category_id, new_status_id, start_date, end_date, due_date,
              created_at, updated_at, deleted_at))
        id_map['todos'][old_id] = new_cursor.lastrowid

    new_conn.commit()
    print(f"  Created {len(rows)} todo nodes.")

    # Second pass: set parent relationships and update paths
    print("  Setting parent relationships...")
    old_cursor.execute("""
        SELECT id, project_id, topic_id, parent_id FROM todos
    """)
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, project_id, topic_id, parent_id = row
        new_id = id_map['todos'].get(old_id)
        if not new_id:
            continue

        # Determine parent: todo parent > topic > project
        new_parent_id = None
        if parent_id and parent_id in id_map['todos']:
            new_parent_id = id_map['todos'][parent_id]
        elif topic_id and topic_id in id_map['topics']:
            new_parent_id = id_map['topics'][topic_id]
        elif project_id and project_id in id_map['projects']:
            new_parent_id = id_map['projects'][project_id]

        if new_parent_id:
            # Get parent depth and path
            new_cursor.execute("SELECT depth, path FROM nodes WHERE id = ?", (new_parent_id,))
            result = new_cursor.fetchone()
            if result:
                parent_depth, parent_path = result
                new_depth = (parent_depth or 0) + 1
                new_path = f"{parent_path}/{new_id}" if parent_path else str(new_id)

                new_cursor.execute("""
                    UPDATE nodes SET parent_id = ?, depth = ?, path = ? WHERE id = ?
                """, (new_parent_id, new_depth, new_path, new_id))

    new_conn.commit()
    print("  Done setting parent relationships.")


def migrate_subtasks(old_conn, new_conn):
    """Migrate subtasks to nodes with type='task'."""
    print("Migrating subtasks...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("""
        SELECT id, todo_id, title, completed, sort_order, due_date, created_at
        FROM subtasks
    """)
    rows = old_cursor.fetchall()

    for row in rows:
        old_id, todo_id, title, completed, sort_order, due_date, created_at = row

        # Get new parent todo ID
        new_parent_id = id_map['todos'].get(todo_id)
        if not new_parent_id:
            print(f"  Warning: Subtask {old_id} has invalid todo_id {todo_id}, skipping.")
            continue

        # Get parent depth and path
        new_cursor.execute("SELECT depth, path FROM nodes WHERE id = ?", (new_parent_id,))
        result = new_cursor.fetchone()
        parent_depth, parent_path = result if result else (0, '')

        new_cursor.execute("""
            INSERT INTO nodes (type, title, completed, sort_order, due_date, parent_id, depth, created_at, updated_at, path)
            VALUES ('task', ?, ?, ?, ?, ?, ?, ?, ?, '')
        """, (title, completed, sort_order, due_date, new_parent_id, (parent_depth or 0) + 1, created_at, created_at))
        new_id = new_cursor.lastrowid
        id_map['subtasks'][old_id] = new_id

        # Update path
        new_path = f"{parent_path}/{new_id}" if parent_path else str(new_id)
        new_cursor.execute("UPDATE nodes SET path = ? WHERE id = ?", (new_path, new_id))

    new_conn.commit()
    print(f"  Migrated {len(rows)} subtasks.")


def migrate_todo_links(old_conn, new_conn):
    """Migrate todo_links to node_links."""
    print("Migrating todo links...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("SELECT source_id, target_id, created_at FROM todo_links")
    rows = old_cursor.fetchall()

    count = 0
    for row in rows:
        source_id, target_id, created_at = row
        new_source_id = id_map['todos'].get(source_id)
        new_target_id = id_map['todos'].get(target_id)

        if new_source_id and new_target_id:
            try:
                new_cursor.execute("""
                    INSERT INTO node_links (source_id, target_id, link_type, created_at)
                    VALUES (?, ?, 'related', ?)
                """, (new_source_id, new_target_id, created_at))
                count += 1
            except sqlite3.IntegrityError:
                pass  # Link already exists

    new_conn.commit()
    print(f"  Migrated {count} todo links.")


def migrate_todo_persons(old_conn, new_conn):
    """Migrate todo_persons to node_links."""
    print("Migrating todo-person relationships...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("SELECT todo_id, person_id, created_at FROM todo_persons")
    rows = old_cursor.fetchall()

    count = 0
    for row in rows:
        todo_id, person_id, created_at = row
        new_todo_id = id_map['todos'].get(todo_id)
        new_person_id = id_map['persons'].get(person_id)

        if new_todo_id and new_person_id:
            try:
                new_cursor.execute("""
                    INSERT INTO node_links (source_id, target_id, link_type, created_at)
                    VALUES (?, ?, 'assigned', ?)
                """, (new_todo_id, new_person_id, created_at))
                count += 1
            except sqlite3.IntegrityError:
                pass

    new_conn.commit()
    print(f"  Migrated {count} todo-person links.")


def migrate_project_persons(old_conn, new_conn):
    """Migrate project_persons to node_links."""
    print("Migrating project-person relationships...")
    old_cursor = old_conn.cursor()
    new_cursor = new_conn.cursor()

    old_cursor.execute("SELECT project_id, person_id, stakeholder_type, created_at FROM project_persons")
    rows = old_cursor.fetchall()

    count = 0
    for row in rows:
        project_id, person_id, stakeholder_type, created_at = row
        new_project_id = id_map['projects'].get(project_id)
        new_person_id = id_map['persons'].get(person_id)

        if new_project_id and new_person_id:
            link_type = stakeholder_type if stakeholder_type else 'stakeholder'
            try:
                new_cursor.execute("""
                    INSERT INTO node_links (source_id, target_id, link_type, created_at)
                    VALUES (?, ?, ?, ?)
                """, (new_project_id, new_person_id, link_type, created_at))
                count += 1
            except sqlite3.IntegrityError:
                pass

    new_conn.commit()
    print(f"  Migrated {count} project-person links.")


def print_summary(new_conn):
    """Print migration summary."""
    cursor = new_conn.cursor()

    print("\n" + "="*50)
    print("MIGRATION SUMMARY")
    print("="*50)

    cursor.execute("SELECT type, COUNT(*) FROM nodes GROUP BY type ORDER BY type")
    print("\nNodes by type:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]}")

    cursor.execute("SELECT COUNT(*) FROM nodes")
    print(f"\nTotal nodes: {cursor.fetchone()[0]}")

    cursor.execute("SELECT COUNT(*) FROM node_links")
    print(f"Total links: {cursor.fetchone()[0]}")

    cursor.execute("SELECT COUNT(*) FROM categories")
    print(f"Categories: {cursor.fetchone()[0]}")

    cursor.execute("SELECT COUNT(*) FROM statuses")
    print(f"Statuses: {cursor.fetchone()[0]}")

    print("\n" + "="*50)


def main():
    print("="*50)
    print("MIGRATING: my-todo-list -> graph-core")
    print("="*50)
    print(f"\nOld database: {OLD_DB}")
    print(f"New database: {NEW_DB}\n")

    old_conn = get_old_connection()
    new_conn = get_new_connection()

    try:
        # Clear existing data
        clear_new_database(new_conn)

        # Migrate in order (respecting dependencies)
        migrate_categories(old_conn, new_conn)
        migrate_statuses(old_conn, new_conn)
        migrate_persons(old_conn, new_conn)
        migrate_projects(old_conn, new_conn)
        migrate_topics(old_conn, new_conn)
        migrate_todos(old_conn, new_conn)
        migrate_subtasks(old_conn, new_conn)

        # Migrate relationships
        migrate_todo_links(old_conn, new_conn)
        migrate_todo_persons(old_conn, new_conn)
        migrate_project_persons(old_conn, new_conn)

        # Print summary
        print_summary(new_conn)

        print("\nMigration completed successfully!")

    except Exception as e:
        print(f"\nERROR: Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        old_conn.close()
        new_conn.close()

    return 0


if __name__ == "__main__":
    exit(main())
