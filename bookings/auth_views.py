from django.contrib.auth.forms import AuthenticationForm
from django.contrib.auth.views import LoginView


class StaffAuthenticationForm(AuthenticationForm):
    def confirm_login_allowed(self, user):
        super().confirm_login_allowed(user)
        if not user.is_staff:
            # Match the invalid-credentials message; don't reveal account roles.
            raise self.get_invalid_login_error()


class StaffLoginView(LoginView):
    authentication_form = StaffAuthenticationForm
    template_name = "registration/login.html"
