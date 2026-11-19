import React from 'react';
import { RepoDescriptor } from '@shared/protocol/types';
import { Icon } from './Icon';

export function RepoBar({
  repos,
  activeRepo,
  onSelect,
  onAdd
}: {
  repos: RepoDescriptor[];
  activeRepo: string | null;
  onSelect: (root: string) => void;
  onAdd: () => void;
}): React.ReactElement {
  return (
    <div className="repo-tabs" role="tablist" aria-label="Repositories">
      <div className="repo-tabs-inner">
        {repos.map((repo) => {
          const active = repo.root === activeRepo;
          return (
            <button
              key={repo.root}
              type="button"
              role="tab"
              aria-selected={active}
              className={`repo-tab${active ? ' active' : ''}`}
              title={repo.root}
              onClick={() => onSelect(repo.root)}
            >
              {repo.dirty ? <span className="repo-tab-dot" /> : null}
              <span className="repo-tab-name">{repo.name}</span>
              {repo.branch ? <span className="repo-tab-branch">{repo.branch}</span> : null}
            </button>
          );
        })}
      </div>
      <button type="button" className="repo-tab-add" title="Open repository" onClick={onAdd}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
