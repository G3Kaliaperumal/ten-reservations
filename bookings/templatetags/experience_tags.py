"""Optional, presentation-only photography for the supplied inventory titles."""
from django import template

register = template.Library()

# Illustrative covers, not extra inventory attributes. Unknown titles use a
# neutral, code-drawn fallback in the template.
COVERS = {
    "bali": "bali", "madeira": "madeira", "paris trip": "paris",
    "f1 stage": "motorsport", "hot air balloon": "balloons",
    "route 66": "route66", "milano": "milano", "italy": "rome",
    "rome": "rome", "france": "paris", "versailles": "versailles",
    "london": "london", "halifax": "halifax", "england": "london",
}


@register.filter
def experience_cover(title):
    name = COVERS.get(str(title).strip().casefold())
    return f"bookings/images/{name}.jpg" if name else ""
