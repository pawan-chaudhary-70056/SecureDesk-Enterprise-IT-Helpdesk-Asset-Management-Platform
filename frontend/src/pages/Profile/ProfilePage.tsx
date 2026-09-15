import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { api, ApiError } from "@/api/client";
import { useAuth } from "@/features/auth/auth-context";
import { Badge, Field } from "@/components/ui/ui";

const changePwSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(10, "At least 10 characters")
      .regex(/[a-zA-Z]/, "Must contain a letter")
      .regex(/[0-9]/, "Must contain a number"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type ChangePwForm = z.infer<typeof changePwSchema>;

export function ProfilePage() {
  const { user } = useAuth();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePwForm>({ resolver: zodResolver(changePwSchema) });

  const onSubmit = async (values: ChangePwForm) => {
    setResult(null);
    try {
      await api.post("/auth/change-password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setResult({ ok: true, message: "Password changed. All other sessions were signed out." });
      reset();
    } catch (err) {
      setResult({ ok: false, message: err instanceof ApiError ? err.message : "Failed to change password" });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-800">Profile</h1>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-medium text-slate-700">{user?.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-700">{user?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Role</dt>
            <dd>
              <Badge value={user?.role ?? ""} />
            </dd>
          </div>
        </dl>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-blue-600">View permissions</summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user?.permissions.map((p) => (
              <span key={p} className="badge bg-slate-100 text-slate-600">
                {p}
              </span>
            ))}
          </div>
        </details>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-slate-700">Change password</h2>
        <form className="mt-4 max-w-md space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Current password" error={errors.currentPassword?.message}>
            <input className="input" type="password" autoComplete="current-password" {...register("currentPassword")} />
          </Field>
          <Field label="New password" error={errors.newPassword?.message}>
            <input className="input" type="password" autoComplete="new-password" {...register("newPassword")} />
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword?.message}>
            <input className="input" type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </Field>
          {result ? (
            <p className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {result.message}
            </p>
          ) : null}
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>
    </div>
  );
}
