import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { supabase } from "@/lib/supabase";
import { mapAuthErrorMessage } from "@/store/userStore";
import { Button } from "@/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/ui/form";
import { Input } from "@/ui/input";
import { ReturnButton } from "./components/ReturnButton";
import { LoginStateEnum, useLoginStateContext } from "./providers/login-provider";

interface ResetFormValues {
	email: string;
}

function ResetForm() {
	const { t } = useTranslation();
	const { loginState, backToLogin } = useLoginStateContext();
	const [loading, setLoading] = useState(false);
	const [sent, setSent] = useState(false);

	const form = useForm<ResetFormValues>({ defaultValues: { email: "" } });

	const onFinish = async (values: ResetFormValues) => {
		if (loading) return;
		setLoading(true);
		try {
			const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
				redirectTo: `${window.location.origin}/nova-senha`,
			});
			if (error) throw error;
			setSent(true);
			toast.success("Se este e-mail tiver uma conta, enviamos um link para redefinir a senha.", {
				position: "top-center",
			});
		} catch (err) {
			toast.error(mapAuthErrorMessage(err), {
				position: "top-center",
			});
		} finally {
			setLoading(false);
		}
	};

	if (loginState !== LoginStateEnum.RESET_PASSWORD) return null;

	return (
		<>
			<div className="mb-8 text-center">
				<Icon icon="local:ic-reset-password" size="100" className="text-primary!" />
			</div>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onFinish)} className="space-y-4">
					<div className="flex flex-col items-center gap-2 text-center">
						<h1 className="text-2xl font-bold">{t("sys.login.forgetFormTitle")}</h1>
						<p className="text-balance text-sm text-muted-foreground">{t("sys.login.forgetFormSecondTitle")}</p>
					</div>

					<FormField
						control={form.control}
						name="email"
						rules={{
							required: t("sys.login.emaildPlaceholder"),
							pattern: { value: /^\S+@\S+\.\S+$/, message: t("sys.login.emaildPlaceholder") },
						}}
						render={({ field }) => (
							<FormItem>
								<FormControl>
									<Input type="email" autoComplete="email" placeholder={t("sys.login.email")} {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
						{loading && <Loader2 className="animate-spin mr-2" size={16} />}
						{t("sys.login.sendEmailButton")}
					</Button>
					{sent && (
						<output className="block text-center text-sm text-success-dark dark:text-success">
							E-mail enviado. Confira também a caixa de spam.
						</output>
					)}
					<ReturnButton onClick={backToLogin} />
				</form>
			</Form>
		</>
	);
}

export default ResetForm;
