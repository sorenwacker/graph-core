"""Tests for the database module."""

import tempfile
from pathlib import Path

import pytest

from graph_core.database import Database
from graph_core.models import NodeCreate, NodeType, NodeUpdate


@pytest.fixture
def db():
    """Create a temporary database for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    database = Database(db_path)
    database.connect()
    yield database
    database.close()
    Path(db_path).unlink(missing_ok=True)


class TestNodeCRUD:
    """Test basic CRUD operations."""

    def test_create_node(self, db):
        node = db.create_node(NodeCreate(title="Test Node"))
        assert node.id is not None
        assert node.title == "Test Node"
        assert node.type == NodeType.TODO

    def test_get_node(self, db):
        created = db.create_node(NodeCreate(title="Test"))
        fetched = db.get_node(created.id)
        assert fetched is not None
        assert fetched.title == "Test"

    def test_update_node(self, db):
        node = db.create_node(NodeCreate(title="Original"))
        updated = db.update_node(node.id, NodeUpdate(title="Updated"))
        assert updated.title == "Updated"

    def test_delete_node_soft(self, db):
        node = db.create_node(NodeCreate(title="To Delete"))
        db.delete_node(node.id, hard=False)
        assert db.get_node(node.id) is None

    def test_delete_node_hard(self, db):
        node = db.create_node(NodeCreate(title="To Delete"))
        db.delete_node(node.id, hard=True)
        assert db.get_node(node.id) is None


class TestTreeOperations:
    """Test tree hierarchy operations."""

    def test_parent_child_relationship(self, db):
        parent = db.create_node(NodeCreate(title="Parent", type=NodeType.PROJECT))
        child = db.create_node(NodeCreate(title="Child", parent_id=parent.id))

        children = db.get_children(parent.id)
        assert len(children) == 1
        assert children[0].title == "Child"

    def test_depth_calculation(self, db):
        root = db.create_node(NodeCreate(title="Root", type=NodeType.PROJECT))
        child = db.create_node(NodeCreate(title="Child", parent_id=root.id))
        grandchild = db.create_node(NodeCreate(title="Grandchild", parent_id=child.id))

        assert db.get_node(root.id).depth == 0
        assert db.get_node(child.id).depth == 1
        assert db.get_node(grandchild.id).depth == 2

    def test_get_descendants(self, db):
        root = db.create_node(NodeCreate(title="Root", type=NodeType.PROJECT))
        child1 = db.create_node(NodeCreate(title="Child1", parent_id=root.id))
        child2 = db.create_node(NodeCreate(title="Child2", parent_id=root.id))
        grandchild = db.create_node(NodeCreate(title="Grandchild", parent_id=child1.id))

        descendants = db.get_descendants(root.id)
        assert len(descendants) == 3

    def test_get_ancestors(self, db):
        root = db.create_node(NodeCreate(title="Root", type=NodeType.PROJECT))
        child = db.create_node(NodeCreate(title="Child", parent_id=root.id))
        grandchild = db.create_node(NodeCreate(title="Grandchild", parent_id=child.id))

        ancestors = db.get_ancestors(grandchild.id)
        assert len(ancestors) == 2
        assert ancestors[0].title == "Root"
        assert ancestors[1].title == "Child"

    def test_move_node(self, db):
        project1 = db.create_node(NodeCreate(title="Project1", type=NodeType.PROJECT))
        project2 = db.create_node(NodeCreate(title="Project2", type=NodeType.PROJECT))
        todo = db.create_node(NodeCreate(title="Todo", parent_id=project1.id))

        db.move_node(todo.id, project2.id)
        moved = db.get_node(todo.id)
        assert moved.parent_id == project2.id


class TestLinks:
    """Test node linking operations."""

    def test_link_nodes(self, db):
        node1 = db.create_node(NodeCreate(title="Node1"))
        node2 = db.create_node(NodeCreate(title="Node2"))

        assert db.link_nodes(node1.id, node2.id) is True

    def test_get_linked_nodes(self, db):
        node1 = db.create_node(NodeCreate(title="Node1"))
        node2 = db.create_node(NodeCreate(title="Node2"))
        node3 = db.create_node(NodeCreate(title="Node3"))

        db.link_nodes(node1.id, node2.id)
        db.link_nodes(node1.id, node3.id)

        linked = db.get_linked_nodes(node1.id)
        assert len(linked) == 2

    def test_unlink_nodes(self, db):
        node1 = db.create_node(NodeCreate(title="Node1"))
        node2 = db.create_node(NodeCreate(title="Node2"))

        db.link_nodes(node1.id, node2.id)
        db.unlink_nodes(node1.id, node2.id)

        linked = db.get_linked_nodes(node1.id)
        assert len(linked) == 0
