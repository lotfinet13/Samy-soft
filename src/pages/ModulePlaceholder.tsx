import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export function ModulePlaceholder(props: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={props.title} subtitle={props.subtitle} />
      <EmptyState
        icon={Icon}
        title="Module en préparation"
        description="La Phase 1 fournit la fondation (navigation, sécurité, données locales). Les écrans métier détaillés seront ajoutés phase suivante avec workflows industriels complets."
      />
    </div>
  );
}
