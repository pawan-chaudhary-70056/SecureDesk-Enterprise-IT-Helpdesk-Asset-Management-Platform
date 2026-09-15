import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/auth-context";
import { ApiError } from "@/api/client";
import { Field } from "@/components/ui/ui";

const loginFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type LoginForm = z.infer<typeof loginFormSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginFormSchema) });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate((location.state as { from?: string } | null)?.from ?? "/dashboard", { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Login failed. Please try again.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-blue-700">SecureDesk</h1>
        <p className="mt-1 text-sm text-slate-500">Enterprise IT Helpdesk & Asset Management</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Email" error={errors.email?.message}>
            <input className="input" type="email" autoComplete="email" placeholder="you@company.com" {...register("email")} />
          </Field>
          <Field label="Password" error={errors.password?.message}>
            <input className="input" type="password" autoComplete="current-password" placeholder="••••••••••" {...register("password")} />
          </Field>

          {serverError ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {serverError}
            </p>
          ) : null}

          <button className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-medium text-slate-600">Demo accounts (password: Password123!)</p>
          <ul className="mt-1 space-y-0.5">
            <li>admin@securedesk.local — ADMIN</li>
            <li>agent@securedesk.local — IT_SUPPORT</li>
            <li>manager@securedesk.local — MANAGER</li>
            <li>employee@securedesk.local — EMPLOYEE</li>
          </ul>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          No account? <a className="font-medium text-blue-600 hover:underline" href="mailto:ithelp@company.com">Contact your administrator</a>
        </p>
      </div>
    </div>
  );
}
