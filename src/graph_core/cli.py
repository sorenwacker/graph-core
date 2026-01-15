"""Typer CLI for graph-core."""

from typing import Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.tree import Tree

from .database import Database, get_default_db_path, get_data_dir
from .models import NodeCreate, NodeType, NodeUpdate

app = typer.Typer(help="Graph Core CLI - Unified node-based graph management")
console = Console()


def get_db(db_path: Optional[str] = None) -> Database:
    """Get database connection."""
    db = Database(db_path)
    db.connect()
    return db


@app.command()
def info():
    """Show database location and info."""
    db_path = get_default_db_path()
    data_dir = get_data_dir()
    console.print(f"[bold]Data directory:[/bold] {data_dir}")
    console.print(f"[bold]Database path:[/bold] {db_path}")
    if db_path.exists():
        size = db_path.stat().st_size
        console.print(f"[bold]Database size:[/bold] {size / 1024:.1f} KB")
    else:
        console.print("[yellow]Database not created yet[/yellow]")


# Server command


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", help="Host to bind to"),
    port: int = typer.Option(8000, help="Port to bind to"),
    reload: bool = typer.Option(False, help="Enable auto-reload"),
):
    """Start the FastAPI server."""
    import uvicorn

    uvicorn.run(
        "graph_core.api:app",
        host=host,
        port=port,
        reload=reload,
    )


# Node commands


@app.command()
def add(
    title: str = typer.Argument(..., help="Node title"),
    node_type: NodeType = typer.Option(NodeType.TASK, "--type", "-t", help="Node type"),
    parent: Optional[int] = typer.Option(None, "--parent", "-p", help="Parent node ID"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Add a new node."""
    db = get_db(db_path)
    node = db.create_node(NodeCreate(title=title, type=node_type, parent_id=parent))
    console.print(f"[green]Created node {node.id}:[/green] {node.title}")
    db.close()


@app.command()
def ls(
    node_type: Optional[NodeType] = typer.Option(None, "--type", "-t", help="Filter by type"),
    parent: Optional[int] = typer.Option(None, "--parent", "-p", help="Filter by parent"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """List nodes."""
    db = get_db(db_path)

    if parent is not None:
        nodes = db.get_children(parent, node_type=node_type)
    else:
        nodes = db.get_nodes(node_type=node_type)

    table = Table(title="Nodes")
    table.add_column("ID", style="cyan")
    table.add_column("Type", style="magenta")
    table.add_column("Title")
    table.add_column("Parent", style="dim")
    table.add_column("Done", style="green")

    for node in nodes:
        table.add_row(
            str(node.id),
            node.type.value,
            node.title,
            str(node.parent_id) if node.parent_id else "-",
            "x" if node.completed else "",
        )

    console.print(table)
    db.close()


@app.command()
def tree(
    root_id: Optional[int] = typer.Argument(None, help="Root node ID (omit for all roots)"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Display nodes as a tree."""
    db = get_db(db_path)

    def build_tree(parent_id: Optional[int], tree_node: Tree):
        children = db.get_children(parent_id) if parent_id else db.get_root_nodes()
        for child in children:
            icon = {"project": "[blue]P[/blue]", "task": "[yellow]T[/yellow]",
                    "note": "[green]N[/green]", "milestone": "[red]M[/red]",
                    "topic": "[cyan]C[/cyan]", "folder": "[dim]F[/dim]"}.get(child.type.value, "?")
            done = "[dim][x][/dim] " if child.completed else ""
            branch = tree_node.add(f"{icon} {done}{child.title} [dim]({child.id})[/dim]")
            build_tree(child.id, branch)

    if root_id:
        root = db.get_node(root_id)
        if not root:
            console.print("[red]Node not found[/red]")
            return
        display_tree = Tree(f"[bold]{root.title}[/bold] ({root.id})")
        build_tree(root_id, display_tree)
    else:
        display_tree = Tree("[bold]Graph[/bold]")
        build_tree(None, display_tree)

    console.print(display_tree)
    db.close()


@app.command()
def show(
    node_id: int = typer.Argument(..., help="Node ID"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Show details of a node."""
    db = get_db(db_path)
    node = db.get_node(node_id)

    if not node:
        console.print("[red]Node not found[/red]")
        return

    console.print(f"[bold]ID:[/bold] {node.id}")
    console.print(f"[bold]Type:[/bold] {node.type.value}")
    console.print(f"[bold]Title:[/bold] {node.title}")
    console.print(f"[bold]Parent:[/bold] {node.parent_id or 'None'}")
    console.print(f"[bold]Depth:[/bold] {node.depth}")
    console.print(f"[bold]Path:[/bold] {node.path}")
    console.print(f"[bold]Completed:[/bold] {'Yes' if node.completed else 'No'}")
    if node.notes:
        console.print(f"[bold]Notes:[/bold] {node.notes}")
    console.print(f"[bold]Created:[/bold] {node.created_at}")

    db.close()


@app.command()
def done(
    node_id: int = typer.Argument(..., help="Node ID"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Mark a node as completed."""
    db = get_db(db_path)
    node = db.update_node(node_id, NodeUpdate(completed=True))
    if node:
        console.print(f"[green]Completed:[/green] {node.title}")
    else:
        console.print("[red]Node not found[/red]")
    db.close()


@app.command()
def mv(
    node_id: int = typer.Argument(..., help="Node ID to move"),
    parent_id: Optional[int] = typer.Argument(None, help="New parent ID (omit for root)"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Move a node to a new parent."""
    db = get_db(db_path)
    node = db.move_node(node_id, parent_id)
    if node:
        console.print(f"[green]Moved:[/green] {node.title} -> {parent_id or 'root'}")
    else:
        console.print("[red]Node not found[/red]")
    db.close()


@app.command()
def rm(
    node_id: int = typer.Argument(..., help="Node ID"),
    hard: bool = typer.Option(False, "--hard", help="Permanently delete"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Delete a node."""
    db = get_db(db_path)
    db.delete_node(node_id, hard=hard)
    action = "Deleted" if hard else "Soft-deleted"
    console.print(f"[yellow]{action} node {node_id}[/yellow]")
    db.close()


@app.command()
def link(
    source_id: int = typer.Argument(..., help="Source node ID"),
    target_id: int = typer.Argument(..., help="Target node ID"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Link two nodes."""
    db = get_db(db_path)
    if db.link_nodes(source_id, target_id):
        console.print(f"[green]Linked {source_id} <-> {target_id}[/green]")
    else:
        console.print("[yellow]Link already exists[/yellow]")
    db.close()


@app.command()
def links(
    node_id: int = typer.Argument(..., help="Node ID"),
    db_path: str = typer.Option("graph.db", "--db", help="Database path"),
):
    """Show nodes linked to a node."""
    db = get_db(db_path)
    linked = db.get_linked_nodes(node_id)

    if not linked:
        console.print("[dim]No linked nodes[/dim]")
        return

    table = Table(title=f"Nodes linked to {node_id}")
    table.add_column("ID", style="cyan")
    table.add_column("Type", style="magenta")
    table.add_column("Title")

    for node in linked:
        table.add_row(str(node.id), node.type.value, node.title)

    console.print(table)
    db.close()


if __name__ == "__main__":
    app()
