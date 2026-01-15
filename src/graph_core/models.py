"""Node models for the graph data structure."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class NodeType(str, Enum):
    """Types of nodes in the graph."""

    PROJECT = "project"
    TASK = "task"
    NOTE = "note"
    MILESTONE = "milestone"
    TOPIC = "topic"
    FOLDER = "folder"
    PERSON = "person"
    EVENT = "event"


class NodeBase(BaseModel):
    """Base node fields."""

    title: str
    type: NodeType = NodeType.TASK
    parent_id: Optional[int] = None
    notes: str = ""
    notes_sensitive: bool = False
    completed: bool = False
    favorite: bool = False
    color: Optional[str] = None
    sort_order: int = 0
    importance: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    due_date: Optional[str] = None
    # Event/location field
    location: Optional[str] = None
    # Person-specific fields
    email: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    role: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class NodeCreate(NodeBase):
    """Schema for creating a node."""

    pass


class NodeUpdate(BaseModel):
    """Schema for updating a node."""

    title: Optional[str] = None
    type: Optional[NodeType] = None
    parent_id: Optional[int] = None
    notes: Optional[str] = None
    notes_sensitive: Optional[bool] = None
    completed: Optional[bool] = None
    favorite: Optional[bool] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    importance: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    due_date: Optional[str] = None
    # Event/location field
    location: Optional[str] = None
    # Person-specific fields
    email: Optional[str] = None
    phone: Optional[str] = None
    organization: Optional[str] = None
    role: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None


class Node(NodeBase):
    """Full node with database fields."""

    model_config = {"from_attributes": True}

    id: int
    depth: int = 0
    path: str = ""
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class NodeWithChildren(Node):
    """Node with nested children for tree responses."""

    children: list["NodeWithChildren"] = Field(default_factory=list)


class MoveRequest(BaseModel):
    """Schema for moving a node to a new parent."""

    new_parent_id: Optional[int] = None
