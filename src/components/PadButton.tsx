import { useControl } from "../control/useControl";

interface PadButtonProps {
  id: string;
  label: React.ReactNode;
  onPress: () => void;
  active?: boolean;
  color?: string;
  width?: number | string;
  title?: string;
}

/**
 * A gesture-controllable button (transport, loop, etc.). Works by click and by
 * hand-pinch (registered as a "button" control).
 */
export function PadButton({
  id,
  label,
  onPress,
  active = false,
  color = "var(--accent)",
  width,
  title,
}: PadButtonProps): JSX.Element {
  const ref = useControl<HTMLButtonElement>({
    id,
    type: "button",
    onTrigger: onPress,
  });
  return (
    <button
      ref={ref}
      title={title}
      onClick={onPress}
      style={{
        width,
        minWidth: 44,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
        background: active ? color : "var(--glass)",
        border: `1px solid ${active ? color : "var(--glass-border)"}`,
        color: active ? "#05060b" : "var(--text)",
        fontWeight: 600,
        fontSize: 12,
        letterSpacing: 0.4,
        boxShadow: active ? `0 0 18px ${color}` : "none",
        transition: "all 0.12s ease",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
      }}
    >
      {label}
    </button>
  );
}
