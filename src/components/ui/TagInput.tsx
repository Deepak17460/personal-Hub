import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { dedupeTags, LIMITS } from '@/schemas/common';
import { cn } from '@/utils/cn';

interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

/** Type a tag and press Enter or comma. Backspace on an empty field removes the last tag. */
export function TagInput({ id, value, onChange, placeholder = 'Add tag…', ...aria }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange(dedupeTags([...value, ...parts]));
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className={cn('input-base flex min-h-10.5 flex-wrap items-center gap-1.5 py-1.5')} aria-invalid={aria['aria-invalid']}>
      {value.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
          #{tag}
          <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => onChange(value.filter((t) => t !== tag))} className="hover:text-indigo-900 dark:hover:text-white">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && commit(draft)}
        placeholder={value.length >= LIMITS.tags ? '' : placeholder}
        disabled={value.length >= LIMITS.tags}
        maxLength={LIMITS.tag}
        aria-describedby={aria['aria-describedby']}
        className="min-w-24 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-slate-400"
      />
    </div>
  );
}
