"""Session authentication and staff-only reads for the Angular client."""
from django.contrib.auth import login, logout
from django.db.models import Count, Q, Value
from django.db.models.functions import Concat
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.templatetags.static import static
from django.utils import timezone
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from .access import staff_required
from .auth_views import StaffAuthenticationForm
from .models import Booking, InventoryItem, Member
from .pagination import paginate, pagination_parameters, query_choice
from .services import MAX_BOOKINGS, BookingError
from .templatetags.experience_tags import experience_cover
from .views import booking_data, check_fields, error_response, json_post


def user_data(user):
    return {"username": user.get_username(), "is_staff": user.is_staff}


@never_cache
@require_GET
def session(request):
    if not request.user.is_authenticated:
        return JsonResponse({"authenticated": False, "user": None})
    if not request.user.is_active or not request.user.is_staff:
        return error_response("permission_denied", "Staff access is required.", 403)
    return JsonResponse({"authenticated": True, "user": user_data(request.user)})


@never_cache
@json_post
def sign_in(request, payload):
    check_fields(payload, ["username", "password"])
    if any(not isinstance(payload[key], str) for key in payload):
        raise BookingError("invalid_request", "Username and password must be strings.", 400)
    if len(payload["username"]) > 150 or len(payload["password"]) > 4096:
        return error_response("invalid_credentials", "Please enter a correct username and password for a staff account.", 401)
    form = StaffAuthenticationForm(request, data=payload)
    if not form.is_valid():
        return error_response("invalid_credentials", "Please enter a correct username and password for a staff account.", 401)
    login(request, form.get_user())
    # get_token marks the rotated CSRF cookie for transmission in this response.
    return JsonResponse({"authenticated": True, "user": user_data(request.user), "csrf_token": get_token(request)})


@staff_required(api=True)
@json_post
def sign_out(request, payload):
    check_fields(payload, [])
    logout(request)
    return JsonResponse({"signed_out": True})


def inventory_data(item):
    cover = experience_cover(item.title)
    return {
        "id": item.pk, "title": item.title, "description": item.description,
        "remaining_count": item.remaining_count, "expiration_date": item.expiration_date.isoformat(),
        "is_expired": item.is_expired, "cover_url": static(cover) if cover else "",
        "is_bookable": not item.is_expired and item.remaining_count > 0,
    }


def detailed_booking(booking):
    return {**booking_data(booking), "member_name": str(booking.member), "item_title": str(booking.item)}


@staff_required(api=True)
@require_GET
def inventory(request):
    try:
        parameters = pagination_parameters(request, default_size=6)
        # Retain old available=1 links while giving explicit status priority.
        default_status = "available" if request.GET.get("available") == "1" else "all"
        status = query_choice(request, "status", ("all", "available", "low_stock", "expired", "sold_out"), default_status)
    except ValueError as exc:
        return error_response("invalid_query", str(exc), 400)
    items = InventoryItem.objects.all()
    query = request.GET.get("q", "").strip()[:200]
    if query:
        items = items.filter(title__icontains=query)
    today = timezone.localdate()
    filters = {
        "all": Q(),
        "available": Q(remaining_count__gt=0, expiration_date__gte=today),
        "low_stock": Q(remaining_count__gte=1, remaining_count__lte=2, expiration_date__gte=today),
        "expired": Q(expiration_date__lt=today),
        "sold_out": Q(remaining_count=0),
    }
    counts = items.aggregate(**{key: Count("pk", filter=condition) for key, condition in filters.items()})
    page, pagination = paginate(items.filter(filters[status]), **parameters)
    return JsonResponse({
        "items": [inventory_data(item) for item in page], "pagination": pagination,
        "filter_counts": counts,
        "total_items": InventoryItem.objects.count(), "member_count": Member.objects.count(),
    })


@staff_required(api=True)
@require_GET
def booking_options(request):
    return JsonResponse({
        "members": list(Member.objects.values("id", "name", "surname", "booking_count")),
        "items": [{
            "id": item.pk, "title": item.title, "remaining_count": item.remaining_count,
            "expiration_date": item.expiration_date.isoformat(), "is_expired": item.is_expired,
            "is_bookable": not item.is_expired and item.remaining_count > 0,
        } for item in InventoryItem.objects.all()],
        "max_bookings": MAX_BOOKINGS,
    })


@staff_required(api=True)
@require_GET
def recent_bookings(request):
    try:
        parameters = pagination_parameters(request, max_size=15)
        status = query_choice(request, "status", ("all", "active", "cancelled"), "all")
    except ValueError as exc:
        return error_response("invalid_query", str(exc), 400)
    bookings = Booking.objects.select_related("member", "item")
    query = request.GET.get("q", "").strip()[:200]
    if query:
        bookings = bookings.alias(member_full_name=Concat("member__name", Value(" "), "member__surname")).filter(
            Q(item__title__icontains=query) | Q(member_full_name__icontains=query)
            | Q(reference__icontains=query)
        )
    if status != "all":
        bookings = bookings.filter(cancelled_at__isnull=status == "active")
    page, pagination = paginate(bookings, **parameters)
    return JsonResponse({"bookings": [detailed_booking(booking) for booking in page], "pagination": pagination})


@staff_required(api=True)
@require_GET
def booking_detail(request, reference):
    booking = get_object_or_404(Booking.objects.select_related("member", "item"), reference=reference)
    return JsonResponse(detailed_booking(booking))
