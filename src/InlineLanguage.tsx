import { useLayoutEffect, useRef } from "react";
import type { Word } from "./model";
import {
  VocabularyPhrase,
  type HighlightMode,
  type VocabularySnapshot,
} from "./VocabularyPhrase";
/** The visible text remains the same element while a transparent input supplies the caret. */
export function InlineLanguage({
  value,
  placeholder,
  label,
  words,
  chinese,
  snapshot,
  mode,
  selected,
  recent = false,
  editing = true,
  autoFocus = false,
  keepInput = false,
  onActivate,
  onChange,
  onBlur,
}: {
  value: string;
  placeholder: string;
  label: string;
  words: Word[];
  chinese: boolean;
  snapshot?: VocabularySnapshot;
  mode: HighlightMode;
  selected: boolean;
  recent?: boolean;
  editing?: boolean;
  autoFocus?: boolean;
  keepInput?: boolean;
  onActivate?: () => void;
  onChange: (text: string) => void;
  onBlur: (text: string, changed: boolean) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (editing && autoFocus) input.current?.focus({ preventScroll: true });
  }, [editing, autoFocus]);
  return (
    <span className={`inline-language ${value ? "" : "language-placeholder"}`}>
      <VocabularyPhrase
        text={value || placeholder}
        words={words}
        chinese={chinese}
        snapshot={snapshot}
        mode={mode}
        selected={selected}
        recent={recent}
      />
      {(editing || keepInput) && (
        <textarea
          ref={input}
          aria-label={label}
          className="language-caret"
          value={value}
          placeholder={placeholder}
          maxLength={2000}
          readOnly={!editing}
          tabIndex={editing ? 0 : -1}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onActivate?.();
          }}
          onPointerDown={(event) => {
            if (editing) event.stopPropagation();
            else event.preventDefault();
          }}
          onClick={(event) => {
            if (editing) event.stopPropagation();
          }}
          onChange={(event) => onChange(event.target.value)}
          onFocus={(event) => {
            event.currentTarget.dataset.original = event.currentTarget.value;
          }}
          onBlur={(event) =>
            onBlur(
              event.currentTarget.value,
              event.currentTarget.value !==
                event.currentTarget.dataset.original,
            )
          }
          onKeyDown={(event) => {
            if (
              (event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing) ||
              event.key === "Escape"
            ) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
    </span>
  );
}
