#!/usr/bin/env python3
"""Generate a simple DMG background with graph icon."""

WIDTH = 540
HEIGHT = 400

# Node type colors
COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#e67e22']

def generate_svg():
    """Generate simple graph icon on black background."""

    # 4 rectangles in a simple arrangement
    nodes = [
        {'x': 80,  'y': 80,  'w': 50, 'h': 30, 'color': COLORS[0]},  # top-left
        {'x': 410, 'y': 70,  'w': 50, 'h': 30, 'color': COLORS[1]},  # top-right
        {'x': 60,  'y': 290, 'w': 50, 'h': 30, 'color': COLORS[2]},  # bottom-left
        {'x': 430, 'y': 300, 'w': 50, 'h': 30, 'color': COLORS[3]},  # bottom-right
    ]

    # Links between nodes
    edges = [
        (0, 1, COLORS[0]),
        (0, 2, COLORS[0]),
        (1, 3, COLORS[1]),
        (2, 3, COLORS[2]),
    ]

    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="{WIDTH}" height="{HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#000000"/>

  <!-- Links -->
  <g opacity="0.4">
'''

    for i, j, color in edges:
        n1, n2 = nodes[i], nodes[j]
        svg += f'    <line x1="{n1["x"] + n1["w"]/2}" y1="{n1["y"] + n1["h"]/2}" x2="{n2["x"] + n2["w"]/2}" y2="{n2["y"] + n2["h"]/2}" stroke="{color}" stroke-width="2"/>\n'

    svg += '''  </g>

  <!-- Nodes -->
  <g opacity="0.7">
'''

    for node in nodes:
        svg += f'    <rect x="{node["x"]}" y="{node["y"]}" width="{node["w"]}" height="{node["h"]}" rx="5" fill="{node["color"]}"/>\n'

    svg += '''  </g>
</svg>'''

    return svg

if __name__ == '__main__':
    svg = generate_svg()

    with open('resources/dmg-background.svg', 'w') as f:
        f.write(svg)
    print('Generated resources/dmg-background.svg')

    import subprocess
    subprocess.run(['sips', '-s', 'format', 'png', 'resources/dmg-background.svg', '--out', 'resources/dmg-background.png'], capture_output=True)
    print('Converted to resources/dmg-background.png')
