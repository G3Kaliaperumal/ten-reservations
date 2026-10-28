"""HTTP access policy: the reservation desk is for active staff only."""
from functools import wraps

from django.conf import settings
from django.contrib.auth.views import redirect_to_login
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache


def staff_required(*, api=False):
    def decorate(view):
        @never_cache
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not request.user.is_authenticated:
                if api:
                    return JsonResponse({"error": {
                        "code": "authentication_required", "message": "Sign in with an active staff account.",
                    }}, status=401)
                return redirect_to_login(request.get_full_path(), settings.LOGIN_URL)
            if not request.user.is_active or not request.user.is_staff:
                if api:
                    return JsonResponse({"error": {
                        "code": "permission_denied", "message": "Staff access is required.",
                    }}, status=403)
                return render(request, "403.html", status=403)
            return view(request, *args, **kwargs)
        return wrapped
    return decorate
