from django.urls import path
from django.contrib.auth.views import LogoutView

from . import api_views, frontend_views, views

urlpatterns = [
    path("accounts/login/", frontend_views.sign_in, name="login"),
    path("accounts/logout/", LogoutView.as_view(), name="logout"),
    path("", frontend_views.application, name="inventory"),
    path("bookings/", frontend_views.application, name="booking_page"),
    path("api/auth/session", api_views.session, name="session"),
    path("api/auth/login", api_views.sign_in, name="sign_in_api"),
    path("api/auth/logout", api_views.sign_out, name="sign_out_api"),
    path("api/inventory", api_views.inventory, name="inventory_api"),
    path("api/booking-options", api_views.booking_options, name="booking_options_api"),
    path("api/bookings", api_views.recent_bookings, name="recent_bookings_api"),
    path("api/bookings/<uuid:reference>", api_views.booking_detail, name="booking_detail_api"),
    path("book", views.book_api, name="book_api"),
    path("cancel", views.cancel_api, name="cancel_api"),
    path("api/csrf", views.csrf_token, name="csrf_token"),
]
