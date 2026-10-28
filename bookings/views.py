import json
from functools import wraps
from uuid import UUID

from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.views.decorators.http import require_GET

from .access import staff_required
from .services import BookingError, book_item, cancel_booking


def error_response(code, message, status, fields=None):
    error = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return JsonResponse({"error": error}, status=status)


def csrf_failure(request, reason=""):
    if request.path in {"/book", "/cancel"} or request.path.startswith("/api/"):
        return error_response("csrf_failed", "Fetch /api/csrf and send its token in X-CSRFToken with the same cookies.", 403)
    return render(request, "bookings/csrf_error.html", status=403)


@require_GET
def csrf_token(request):
    response = JsonResponse({"csrf_token": get_token(request)})
    response["Cache-Control"] = "no-store"
    return response


def json_post(function):
    @wraps(function)
    def wrapped(request):
        if request.method != "POST":
            response = error_response("method_not_allowed", "Use POST for this endpoint.", 405)
            response["Allow"] = "POST"
            return response
        if request.content_type != "application/json":
            return error_response("unsupported_media_type", "Send an application/json request body.", 415)
        try:
            payload = json.loads(request.body)
        except RequestDataTooBig:
            return error_response("payload_too_large", "The request body is too large.", 413)
        except (ValueError, UnicodeDecodeError):
            return error_response("invalid_json", "Send a valid JSON object.", 400)
        if not isinstance(payload, dict):
            return error_response("invalid_json", "Send a JSON object, not a list or scalar.", 400)
        try:
            return function(request, payload)
        except BookingError as exc:
            response = error_response(exc.code, exc.message, exc.status)
            if exc.status == 503:
                response["Retry-After"] = "1"
            return response
    return wrapped


def positive_id(payload, key):
    value = payload.get(key)
    if type(value) is not int or not 0 < value <= 9223372036854775807:
        raise BookingError("invalid_request", f"{key} must be a positive integer.", 400)
    return value


def check_fields(payload, expected):
    if set(payload) != set(expected):
        raise BookingError("invalid_request", "Expected exactly these fields: " + ", ".join(expected) + ".", 400)


def booking_data(booking):
    return {
        "booking_reference": str(booking.reference),
        "member_id": booking.member_id,
        "item_id": booking.item_id,
        "booked_at": booking.booked_at.isoformat(),
        "cancelled_at": booking.cancelled_at.isoformat() if booking.cancelled_at else None,
        "status": booking.status,
    }


@staff_required(api=True)
@json_post
def book_api(request, payload):
    check_fields(payload, ["member_id", "item_id"])
    booking = book_item(member_id=positive_id(payload, "member_id"), item_id=positive_id(payload, "item_id"))
    return JsonResponse(booking_data(booking), status=201)


@staff_required(api=True)
@json_post
def cancel_api(request, payload):
    check_fields(payload, ["member_id", "booking_reference"])
    member_id = positive_id(payload, "member_id")
    try:
        value = payload["booking_reference"]
        if not isinstance(value, str):
            raise ValueError
        reference = UUID(value)
    except (ValueError, AttributeError):
        raise BookingError("invalid_request", "booking_reference must be a valid UUID string.", 400) from None
    return JsonResponse(booking_data(cancel_booking(member_id=member_id, booking_reference=reference)))
