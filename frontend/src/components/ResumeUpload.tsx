import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { uploadResume, validateResumeFile } from '../api';
import { useToast } from '../hooks/useToast';
import { cn } from '../lib/cn';
import { formatFileSize } from '../lib/format';
import type { ResumeResponse } from '../types';
import { AlertIcon, CheckCircleIcon, DocumentIcon, UploadIcon, XIcon } from './ui/icons';
import LoadingSpinner from './ui/LoadingSpinner';

type UploadState =
  | { status: 'empty' }
  | { status: 'uploading'; file: File; progress: number }
  | { status: 'parsing'; file: File }
  | { status: 'parsed'; file: File; resume: ResumeResponse };

interface ResumeUploadProps {
  /** Called with the parsed resume once "parsing" completes, or null when removed. */
  onChange: (resume: ResumeResponse | null) => void;
}

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Drag-and-drop resume picker.
 * States: empty → uploading (real byte progress) → parsing (server-side) → parsed.
 * Type/size are validated BEFORE anything is sent.
 */
export default function ResumeUpload({ onChange }: ResumeUploadProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const requestId = useRef(0);
  const [state, setState] = useState<UploadState>({ status: 'empty' });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    const validationError = validateResumeFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const id = ++requestId.current;
    setState({ status: 'uploading', file, progress: 0 });
    onChange(null);
    try {
      const resume = await uploadResume(file, {
        onUploadProgress: (fraction) => {
          if (id !== requestId.current) return;
          // Once every byte is sent, the server is parsing (pdfplumber + spaCy).
          setState(fraction >= 1 ? { status: 'parsing', file } : { status: 'uploading', file, progress: fraction });
        },
      });
      if (id !== requestId.current) return; // removed or replaced while parsing
      setState({ status: 'parsed', file, resume });
      onChange(resume);
      const skills = resume.parsed_json?.skills.length ?? 0;
      toast.success(`Resume parsed successfully — ${skills} skill${skills === 1 ? '' : 's'} identified`);
    } catch (err) {
      if (id !== requestId.current) return;
      setState({ status: 'empty' });
      setError(err instanceof Error ? `Failed to parse resume: ${err.message}` : 'Upload failed. Please try again.');
    }
  };

  const reset = () => {
    requestId.current++;
    setState({ status: 'empty' });
    setError(null);
    onChange(null);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (file) void handleFile(file);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  if (state.status !== 'empty') {
    const { file } = state;
    const parsed = state.status === 'parsed' ? state.resume.parsed_json : null;
    return (
      <div className="animate-fade-in-up space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 pr-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600">
            <DocumentIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-gray-500" aria-live="polite">
              {formatFileSize(file.size)}
              {state.status === 'uploading' && ` · Uploading… ${Math.round(state.progress * 100)}%`}
              {state.status === 'parsing' && ' · Parsing…'}
              {state.status === 'parsed' && ' · Done ✓'}
            </p>
          </div>
          {state.status === 'parsed' ? (
            <CheckCircleIcon className="mx-1 h-5 w-5 text-green-600" />
          ) : (
            <LoadingSpinner
              size="sm"
              label={state.status === 'uploading' ? 'Uploading resume' : 'Parsing resume'}
              className="mx-2 text-blue-600"
            />
          )}
          <button
            type="button"
            onClick={reset}
            aria-label={`Remove ${file.name}`}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {state.status === 'uploading' && (
          <div className="h-1 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div
              className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
              style={{ width: `${Math.max(4, state.progress * 100)}%` }}
            />
          </div>
        )}
        {state.status === 'parsing' && (
          <div className="overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <div className="h-1 w-1/3 animate-indeterminate rounded-full bg-blue-600" />
          </div>
        )}

        {parsed && (
          <div className="animate-fade-in-up rounded-xl border border-green-200 bg-green-50/60 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-green-700">
              <CheckCircleIcon className="h-4 w-4" />
              Parsed successfully
            </p>
            <dl className="mt-3 space-y-1.5 text-sm">
              {[
                ['Name', parsed.contact_info.name ?? 'Not found'],
                ['Email', parsed.contact_info.email ?? 'Not found'],
                ['Skills found', String(parsed.skills.length)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4">
                  <dt className="shrink-0 text-gray-500">{label}</dt>
                  <dd className="truncate font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-describedby={error ? 'resume-upload-error' : 'resume-upload-hint'}
        className={cn(
          'group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center',
          'transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/20',
          dragging
            ? 'scale-[1.01] border-blue-600 bg-blue-50'
            : error
              ? 'border-red-300 bg-red-50/40 hover:border-red-400'
              : 'border-gray-300 bg-gray-50/60 hover:border-blue-400 hover:bg-blue-50/40 focus-visible:border-blue-600',
        )}
      >
        <span
          className={cn(
            'mb-3 flex h-11 w-11 items-center justify-center rounded-full transition-colors',
            dragging
              ? 'bg-blue-600 text-white'
              : 'bg-white text-blue-600 shadow-sm ring-1 ring-gray-200 group-hover:ring-blue-200',
          )}
        >
          <UploadIcon className="h-5 w-5" />
        </span>
        {dragging ? (
          <span className="text-sm font-semibold text-blue-700">Drop your file here</span>
        ) : (
          <span className="text-sm text-gray-700">
            <span className="font-semibold text-blue-600">Drag your resume here</span>, or click to browse
          </span>
        )}
        <span id="resume-upload-hint" className="mt-1 text-xs text-gray-500">
          PDF or DOCX · up to 5 MB
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={onInputChange}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      {error && (
        <p id="resume-upload-error" role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-red-600">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
