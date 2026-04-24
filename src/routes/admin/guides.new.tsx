import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/guides/new")({
  head: () => ({ meta: [{ title: "New Cooking Guide — Admin" }] }),
  component: NewGuideRedirect,
});

function NewGuideRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      const slug = `guide-${Date.now().toString(36)}`;
      const { data, error } = await supabase
        .from("cooking_guides")
        .insert({ title: "Untitled guide", slug, body: "", status: "draft" })
        .select("id")
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Could not create guide");
        navigate({ to: "/admin/guides" });
        return;
      }
      navigate({ to: "/admin/guides/$id", params: { id: data.id }, replace: true });
    })();
  }, [navigate]);
  return <LoadingState label="Creating draft…" />;
}
