import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const CUSTOM_VALUE = "__custom__";

/**
 * Dropdown backed by a fixed list with a "+ Type new…" escape hatch.
 * - If `value` is non-empty and not in `options`, shows the text input immediately.
 * - `required` passes through to the underlying Input when in custom mode.
 */
export function FixedOrCustomSelect({
  value,
  options,
  placeholder,
  onChange,
  required,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [userChoseCustom, setUserChoseCustom] = useState(false);
  const showCustom =
    userChoseCustom ||
    (value !== "" && options.length > 0 && !options.includes(value));

  function handleSelect(v: string) {
    if (v === CUSTOM_VALUE) {
      setUserChoseCustom(true);
      onChange("");
    } else {
      setUserChoseCustom(false);
      onChange(v);
    }
  }

  if (showCustom) {
    return (
      <div className="flex gap-1">
        <Input
          placeholder={`Enter ${placeholder.replace(/^Select\s*/i, "").toLowerCase()}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          required={required}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 text-xs px-2"
          title="Back to list"
          onClick={() => {
            setUserChoseCustom(false);
            onChange(options[0] ?? "");
          }}
        >
          ↩
        </Button>
      </div>
    );
  }

  return (
    <Select value={value || ""} onValueChange={handleSelect}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="capitalize">
            {opt}
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM_VALUE} className="text-muted-foreground italic">
          + Type new…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
