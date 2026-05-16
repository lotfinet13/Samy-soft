export function PageHeader(props: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        {props.subtitle ? (
          <p className="max-w-5xl text-[12.7px] leading-snug text-foreground-muted">{props.subtitle}</p>
        ) : null}
      </div>
      {props.actions ? <div className="flex flex-wrap gap-2">{props.actions}</div> : null}
    </header>
  );
}
