import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ConfirmProvider, useConfirm } from '@/components/ui/Confirm';
import { Markdown } from '@/components/ui/Markdown';
import { TagInput } from '@/components/ui/TagInput';
import { Segmented } from '@/components/ui/Display';

describe('Markdown rendering (XSS safety)', () => {
  it('does not render raw HTML or scripts from user content', () => {
    const { container } = render(<Markdown source={'Hello <script>alert(1)</script> <img src=x onerror="alert(1)"> <b>bold</b>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('drops javascript: links but keeps https links with safe rel', () => {
    render(<Markdown source={'[bad](javascript:alert(1)) and [good](https://example.com)'} />);
    const good = screen.getByRole('link', { name: 'good' });
    expect(good).toHaveAttribute('href', 'https://example.com');
    expect(good).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.getByText('bad')).toBeInTheDocument();
  });

  it('renders GFM features such as task lists and tables', () => {
    const { container } = render(<Markdown source={'- [x] done\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />);
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(container.querySelector('table')).not.toBeNull();
  });
});

function ConfirmHarness() {
  const confirm = useConfirm();
  const [result, setResult] = useState('none');
  return (
    <>
      <button onClick={async () => setResult(String(await confirm({ title: 'Delete it?', message: 'Gone forever', confirmLabel: 'Delete', danger: true })))}>
        open
      </button>
      <p>result:{result}</p>
    </>
  );
}

describe('ConfirmDialog', () => {
  it('resolves true on confirm and false on cancel', async () => {
    render(
      <ConfirmProvider>
        <ConfirmHarness />
      </ConfirmProvider>,
    );
    await userEvent.click(screen.getByText('open'));
    expect(screen.getByText('Gone forever')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('result:true')).toBeInTheDocument();

    await userEvent.click(screen.getByText('open'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('result:false')).toBeInTheDocument();
  });
});

function TagHarness() {
  const [tags, setTags] = useState<string[]>(['one']);
  return (
    <>
      <TagInput value={tags} onChange={setTags} />
      <output>{tags.join('|')}</output>
    </>
  );
}

describe('TagInput', () => {
  it('adds tags with Enter/comma, dedupes and removes with Backspace', async () => {
    render(<TagHarness />);
    const input = screen.getByPlaceholderText('Add tag…');
    await userEvent.type(input, 'Two{Enter}three,ONE{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent('one|Two|three');
    await userEvent.type(input, '{Backspace}');
    expect(screen.getByRole('status')).toHaveTextContent('one|Two');
    await userEvent.click(screen.getByRole('button', { name: 'Remove tag one' }));
    expect(screen.getByRole('status')).toHaveTextContent('Two');
  });
});

describe('Segmented control', () => {
  it('is keyboard/screen-reader accessible as a radio group', async () => {
    function H() {
      const [v, setV] = useState<'a' | 'b'>('a');
      return <Segmented label="View" value={v} onChange={setV} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />;
    }
    render(<H />);
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true');
  });
});
