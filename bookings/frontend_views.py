"""Serve the built Angular entry point; assets use Django staticfiles."""
from pathlib import Path

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from .access import staff_required
from .auth_views import StaffLoginView


def angular_response(request):
    index = Path(settings.FRONTEND_INDEX_FILE)
    if not index.is_file():
        return render(request, "bookings/frontend_missing.html", status=503)
    return HttpResponse(index.read_text(encoding="utf-8"), content_type="text/html")


@staff_required()
@require_GET
def application(request):
    return angular_response(request)


@never_cache
def sign_in(request):
    # Preserve the documented form-based login contract for non-Angular clients.
    if request.method == "GET":
        return angular_response(request)
    return StaffLoginView.as_view()(request)
