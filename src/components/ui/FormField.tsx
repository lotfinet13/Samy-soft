export function FormField(props: {

  label: string;

  description?: string;

  error?: string;

  children: React.ReactNode;

}) {

  return (

    <label className="flex flex-col gap-1.5">

      <span className="text-[11.8px] font-semibold uppercase tracking-wide text-foreground-muted">

        {props.label}

      </span>

      {props.description ? (

        <span className="text-[12px] text-foreground-muted">{props.description}</span>

      ) : null}

      {props.children}

      {props.error ? (

        <span className="text-[12px] font-medium text-danger">{props.error}</span>

      ) : null}

    </label>

  );

}

