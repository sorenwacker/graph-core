"""Node models for the graph data structure."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    """Types of nodes in the graph."""

    PROJECT = "project"
    TODO = "todo"
    NOTE = "note"
    MILESTONE = "milestone"
    TOPIC = "topic"
    FOLDER = "folder"


class NodeBase(BaseModel):
    """Base node fields."""

    title: str
    type: NodeType = NodeType.TODO
    parent_id: Optional[int] = None
    notes: str = ""
    completed: bool = False
    color: Optional[str] = None
    sort_order: int = 0
    importance: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    due_date: Optional[str] = None


class NodeCreate(NodeBase):
    """Schema for creating a node."""

    pass


class NodeUpdate(BaseModel):
    """Schema for updating a node."""

    title: Optional[str] = None
    type: Optional[NodeType] = None
    parent_id: Optional[int] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    importance: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    due_date: Optional[str] = None


class Node(NodeBase):
    """Full node with database fields."""

    id: int
    depth: int = 0
    path: str = ""
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NodeWithChildren(Node):
    """Node with nested children for tree responses."""

    children: list["NodeWithChildren"] = Field(default_factory=list)
