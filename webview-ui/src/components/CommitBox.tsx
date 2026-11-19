import React, { useEffect, useRef, useState } from 'react';
import { ToWebviewMessage } from '@shared/protocol/types';
import { RequestFn, PushToast } from '../bridgeTypes';
import { Icon } from './Icon';
import { IconButton, MenuItem, Spinner, useContextMenu } from './Menu';
import { splitMultilineMessage } from '../utils/format';

interface CommitBoxProps {
  request: RequestFn;
  branch: string | null;
  headSha: string | null;
  stagedCount: number;
  unstagedCount: number;
  conflicts: number;
  recentMessages: string[];
  busy: boolean;
  onCommit: (subject: string, description: string, amend: boolean) => void;
  onPushToast: PushToast;
}

export function CommitBox(props: CommitBoxProps): React.ReactElement {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { openMenu, menuNode } = useContextMenu();
  const subjectRef = useRef<HTMLInputElement>(null);
  const previousHead = useRef(props.headSha);

  useEffect(() => {
    if (previousHead.current !== props.headSha) {
      previousHead.current = props.headSha;
      setSubject('');
      setDescription('');
      setAmend(false);
      setSubmitting(false);
      subjectRef.current?.focus();
    }
  }, [props.headSha]);

  useEffect(() => {
    if (props.busy) return;
    if (submitting && !props.busy) {
      setSubmitting(false);
    }
  }, [props.busy, submitting]);

  useEffect(() => {
    if (!submitting) return;
    const timer = window.setTimeout(() => setSubmitting(false), 6000);
    return () => window.clearTimeout(timer);
  }, [submitting]);

  const loadAmendMessage = async (checked: boolean) => {
    setAmend(checked);
    if (!checked) {
      setSubject('');
      setDescription('');
      return;
    }
    setLoadingMessage(true);
    try {
      const message = await props.request<
        ToWebviewMessage & { type: 'commitMessage' }
      >((requestId) => ({ type: 'loadCommitMessage', requestId, amend: true }), ['commitMessage']);
      if (message.type === 'commitMessage') {
        setSubject(message.subject);
        setDescription(message.description);
      }
    } catch (error) {
      props.onPushToast('error', error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingMessage(false);
    }
  };

  const canCommit =
    subject.trim().length > 0 &&
    (props.stagedCount > 0 || amend) &&
    props.conflicts === 0 &&
    !props.busy &&
    !submitting &&
    !loadingMessage;

  const submit = () => {
    if (!canCommit) return;
    setSubmitting(true);
    props.onCommit(subject, description, amend);
  };

  const recentMenu: MenuItem[] = [
    ...props.recentMessages.slice(0, 20).map((message) => ({
      label: message.length > 70 ? `${message.slice(0, 70)}…` : message,
      icon: 'commit' as const,
      onSelect: () => {
        const parsed = splitMultilineMessage(message);
        setSubject(parsed.subject);
        setDescription(parsed.description);
      }
    })),
    ...(props.recentMessages.length
      ? []
      : [{ label: 'No recent messages', disabled: true }])
  ];

  const subjectLength = subject.length;
  const subjectClass =
    subjectLength > 72 ? 'oversized' : subjectLength > 50 ? 'long' : '';

  return (
    <div className="commit-box">
      <div className="commit-box-header">
        <div className="commit-target">
          <Icon name="branch" size={12} />
          <span>
            {props.branch ? (
              <>
                Commit to <strong>{props.branch}</strong>
              </>
            ) : (
              'Detached HEAD'
            )}
          </span>
        </div>
        <div className="commit-stats">
          <span className="commit-stat">
            <Icon name="stage" size={12} /> {props.stagedCount} staged
          </span>
          {props.unstagedCount ? (
            <span className="commit-stat dim">{props.unstagedCount} unstaged</span>
          ) : null}
          {props.conflicts ? (
            <span className="commit-stat conflict">{props.conflicts} conflict{props.conflicts === 1 ? '' : 's'}</span>
          ) : null}
        </div>
      </div>

      {props.conflicts ? (
        <div className="commit-warning">
          <Icon name="alert" size={13} />
          Resolve all conflicts before committing.
        </div>
      ) : null}

      <div className="commit-fields">
        <div className="commit-subject-row">
          <input
            ref={subjectRef}
            className={`commit-subject ${subjectClass}`}
            value={subject}
            placeholder="Commit subject"
            spellCheck={false}
            onChange={(event) => setSubject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="commit-subject-tools">
            {subjectLength ? (
              <span className={`subject-count ${subjectClass}`}>{subjectLength}/72</span>
            ) : null}
            <IconButton
              icon="history"
              title="Recent commit messages"
              onClick={(event) => openMenu(event, recentMenu)}
            />
          </div>
        </div>
        <textarea
          className="commit-description"
          value={description}
          placeholder="Description (optional)"
          spellCheck={false}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
      </div>

      <div className="commit-footer">
        <label className={`amend-check${amend ? ' checked' : ''}`}>
          <input
            type="checkbox"
            checked={amend}
            onChange={(event) => void loadAmendMessage(event.target.checked)}
          />
          <span className="checkbox-box">{amend ? <Icon name="check" size={10} /> : null}</span>
          <span>Amend last commit</span>
          {loadingMessage ? <Spinner size={12} /> : null}
        </label>
        <div className="commit-footer-right">
          <span className="commit-hint">⌘↵ to commit</span>
          <button type="button" className="primary-button commit-button" disabled={!canCommit} onClick={submit}>
            {submitting || props.busy ? <Spinner size={13} /> : <Icon name="commit" size={14} />}
            {amend ? 'Amend Commit' : 'Commit'}
          </button>
        </div>
      </div>
      {menuNode}
    </div>
  );
}
