"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { VisibilityField } from "@/components/VisibilityField";
import {
  setProjectVisibilityAction,
  type ProjectVisibility,
} from "@/lib/projects/actions";

/** Owner control to switch a project between private and org-public. */
export function ProjectVisibilityControl({
  projectId,
  visibility,
  canEdit,
}: {
  projectId: string;
  visibility: ProjectVisibility;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setVisibility(next: ProjectVisibility) {
    if (!canEdit || next === visibility || pending) return;
    startTransition(async () => {
      const result = await setProjectVisibilityAction(projectId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.visibility === "public"
          ? "Shared with everyone in this org"
          : "Workgroup is private to you",
      );
      router.refresh();
    });
  }

  return (
    <VisibilityField
      value={visibility}
      editable={canEdit}
      disabled={pending}
      onChange={setVisibility}
      name={`project-visibility-${projectId}`}
    />
  );
}
