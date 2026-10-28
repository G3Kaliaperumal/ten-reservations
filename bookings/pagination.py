"""Bounded query validation and SQL-backed pagination for staff lists."""
from django.core.paginator import Paginator


def query_choice(request, key, choices, default):
    value = request.GET.get(key, default)
    if value not in choices:
        raise ValueError(f"{key} must be one of: {', '.join(choices)}.")
    return value


def pagination_parameters(request, default_size=5, max_size=100):
    values = {}
    for key, default in (("page", "1"), ("page_size", str(default_size))):
        value = request.GET.get(key, default)
        if len(value) > 9 or not value.isascii() or not value.isdecimal() or int(value) < 1:
            raise ValueError(f"{key} must be a positive integer.")
        values[key] = int(value)
    if values["page_size"] > max_size:
        raise ValueError(f"page_size must be between 1 and {max_size}.")
    return values


def paginate(queryset, *, page, page_size):
    paginator = Paginator(queryset, page_size)
    if paginator.count:
        page_size = min(page_size, paginator.count)
        paginator.per_page = page_size
    result = paginator.get_page(page)
    return result.object_list, {
        "page": result.number, "page_size": page_size, "total_count": paginator.count,
        "total_pages": paginator.num_pages, "has_next": result.has_next(),
        "has_previous": result.has_previous(), "start_index": result.start_index(),
        "end_index": result.end_index(),
    }
