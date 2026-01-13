"""FastAPI application for graph-core."""

from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query

from .database import Database
from .models import Node, NodeCreate, NodeType, NodeUpdate

db = Database()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage database connection lifecycle."""
    db.connect()
    yield
    db.close()


app = FastAPI(
    title="Graph Core API",
    description="Unified node-based graph data structure with tree hierarchy",
    version="0.1.0",
    lifespan=lifespan,
)


# Node CRUD endpoints


@app.post("/nodes", response_model=Node)
def create_node(node: NodeCreate):
    """Create a new node."""
    return db.create_node(node)


@app.get("/nodes", response_model=list[Node])
def get_nodes(
    type: Optional[NodeType] = Query(None, description="Filter by node type"),
    parent_id: Optional[int] = Query(None, description="Filter by parent ID"),
    include_deleted: bool = Query(False, description="Include soft-deleted nodes"),
):
    """Get nodes with optional filters."""
    return db.get_nodes(node_type=type, parent_id=parent_id, include_deleted=include_deleted)


@app.get("/nodes/{node_id}", response_model=Node)
def get_node(node_id: int):
    """Get a node by ID."""
    node = db.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@app.patch("/nodes/{node_id}", response_model=Node)
def update_node(node_id: int, update: NodeUpdate):
    """Update a node."""
    node = db.update_node(node_id, update)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@app.delete("/nodes/{node_id}")
def delete_node(node_id: int, hard: bool = Query(False, description="Permanently delete")):
    """Delete a node (soft delete by default)."""
    db.delete_node(node_id, hard=hard)
    return {"ok": True}


# Tree operations


@app.get("/nodes/{node_id}/children", response_model=list[Node])
def get_children(
    node_id: int,
    type: Optional[NodeType] = Query(None, description="Filter by node type"),
):
    """Get direct children of a node."""
    return db.get_children(node_id, node_type=type)


@app.get("/nodes/{node_id}/descendants", response_model=list[Node])
def get_descendants(
    node_id: int,
    max_depth: Optional[int] = Query(None, description="Maximum depth to traverse"),
):
    """Get all descendants of a node."""
    return db.get_descendants(node_id, max_depth=max_depth)


@app.get("/nodes/{node_id}/ancestors", response_model=list[Node])
def get_ancestors(node_id: int):
    """Get all ancestors of a node."""
    return db.get_ancestors(node_id)


@app.post("/nodes/{node_id}/move")
def move_node(node_id: int, new_parent_id: Optional[int] = Query(None)):
    """Move a node to a new parent."""
    node = db.move_node(node_id, new_parent_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


# Root nodes (inbox, projects)


@app.get("/roots", response_model=list[Node])
def get_root_nodes(
    type: Optional[NodeType] = Query(None, description="Filter by node type"),
):
    """Get nodes without parents (root level)."""
    return db.get_root_nodes(node_type=type)


@app.get("/projects", response_model=list[Node])
def get_projects():
    """Get all project nodes."""
    return db.get_root_nodes(node_type=NodeType.PROJECT)


@app.get("/inbox", response_model=list[Node])
def get_inbox():
    """Get inbox items (root nodes that are not projects)."""
    roots = db.get_root_nodes()
    return [n for n in roots if n.type != NodeType.PROJECT]


# Link operations


@app.post("/nodes/{source_id}/link/{target_id}")
def link_nodes(source_id: int, target_id: int, link_type: str = "related"):
    """Create a link between two nodes."""
    success = db.link_nodes(source_id, target_id, link_type)
    if not success:
        raise HTTPException(status_code=400, detail="Link already exists")
    return {"ok": True}


@app.delete("/nodes/{source_id}/link/{target_id}")
def unlink_nodes(source_id: int, target_id: int):
    """Remove a link between two nodes."""
    db.unlink_nodes(source_id, target_id)
    return {"ok": True}


@app.get("/nodes/{node_id}/links", response_model=list[Node])
def get_linked_nodes(node_id: int):
    """Get all nodes linked to a given node."""
    return db.get_linked_nodes(node_id)
