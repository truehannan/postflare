import type { ReactNode } from "react";
import { Text } from "@cloudflare/kumo";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
      <div className="grid gap-0.5">
        <Text as="h1" variant="heading" size="lg">
          {title}
        </Text>
        {description ? (
          <Text as="p" variant="secondary">
            {description}
          </Text>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
