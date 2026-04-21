import { Collaborator } from '@/app/types/projectInnerSettings';
import { generateAvatarConfig } from '@/app/utils/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import Avatar from 'react-nice-avatar';

interface ChatsSearchProps {
  onChange: (searchTerm: string) => void;
  onClear: () => void;
  collaborators?: Collaborator[];
  profilePictures?: Map<string, string>;
  onStatusFilterChange?: (status: string) => void;
  onAssigneeFilterChange?: (assignee: string) => void;
}

export const ChatsSearch = ({
  onChange,
  onClear,
  collaborators = [],
  profilePictures = new Map(),
  onStatusFilterChange,
  onAssigneeFilterChange,
}: ChatsSearchProps) => {
  const t = useTranslations('messages');

  const [search, setSearch] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchFilter, setSearchFilter] = useState('all');
  const [teammateFilter, setTeammateFilter] = useState('none');

  const statusLabels: Record<string, string> = {
    all: t('All'),
    unanswered: t('Unanswered'),
    open: t('Opened'),
    blocked: t('Blocked'),
    closed: t('Closed'),
  };

  // Notify parent when status filter changes
  useEffect(() => {
    if (onStatusFilterChange) {
      onStatusFilterChange(searchFilter);
    }
  }, [searchFilter, onStatusFilterChange]);

  // Notify parent when assignee filter changes
  useEffect(() => {
    if (onAssigneeFilterChange) {
      onAssigneeFilterChange(teammateFilter);
    }
  }, [teammateFilter, onAssigneeFilterChange]);

  const handleClear = () => {
    setSearch('');
    setIsExpanded(false);
    onClear();
  };

  const handleSearchClick = () => {
    setIsExpanded(true);
  };

  // Get the selected teammate for displaying their profile pic
  const selectedTeammate = collaborators.find((c) => c.email === teammateFilter);
  const selectedTeammatePicture = selectedTeammate ? profilePictures.get(selectedTeammate.email) : null;
  const selectedTeammateAvatar = selectedTeammate ? generateAvatarConfig(selectedTeammate.email) : null;

  return (
    <div className="h-[41px] px-2 pl-3 border-b-1 flex w-full items-center justify-between gap-2 border-b pb-0">
      {/* Status filter select - always visible */}
      <Select value={searchFilter} onValueChange={(value) => value && setSearchFilter(value)}>
        <SelectTrigger className="bg-background dark:bg-background! text-xs font-semibold w-fit border-0 shadow-none px-0 gap-1 cursor-pointer [&_span]:text-xs [&_span]:text-foreground [&_span]:font-semibold focus-visible:ring-0 focus-visible:border-0 [&_svg]:!text-foreground [&_svg]:!opacity-100">
          <SelectValue>{statusLabels[searchFilter] ?? searchFilter}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem className="cursor-pointer" value="all">
            {t('All')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="unanswered">
            {t('Unanswered')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="open">
            {t('Opened')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="blocked">
            {t('Blocked')}
          </SelectItem>
          <SelectItem className="cursor-pointer" value="closed">
            {t('Closed')}
          </SelectItem>
        </SelectContent>
      </Select>

      {/* Right side container: teammate filter + search */}
      <div className="flex items-center gap-0.5">
        {/* Search bar - expanded state */}
        {isExpanded ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onChange(search.toLowerCase());
            }}
          >
            <div className="relative">
              <Input
                placeholder={t('Search chats by phone or message…')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value || '');
                  onChange((e.target.value || '').toLowerCase());
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={handleClear}
              >
                <X />
              </Button>
            </div>
          </form>
        ) : (
          /* Search icon - collapsed state */
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 cursor-pointer"
            onClick={handleSearchClick}
          >
            <Search />
          </Button>
        )}

        {/* Teammate filter select */}
        <Select value={teammateFilter} onValueChange={(value) => value && setTeammateFilter(value)}>
          <SelectTrigger
            nativeButton={true}
            className="rounded-full bg-background dark:bg-background dark:hover:bg-input text-foreground! cursor-pointer ring-0 border-none px-[calc(1px+var(--spacing)*1.5)] [&_span]:text-foreground [&_svg]:!text-foreground"
            render={
              <Button type="button" variant="ghost" size="icon" className="shrink-0 cursor-pointer">
                {selectedTeammate ? (
                  selectedTeammatePicture ? (
                    <Image
                      src={selectedTeammatePicture}
                      alt={selectedTeammate.name}
                      width={20}
                      height={20}
                      className="rounded-full object-cover w-5 h-5 min-w-5"
                      unoptimized
                    />
                  ) : (
                    <Avatar {...selectedTeammateAvatar} className="rounded-full w-5 h-5 min-w-5" />
                  )
                ) : (
                  <Filter className="text-foreground" strokeWidth={2} />
                )}
              </Button>
            }
          />
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectItem className="cursor-pointer" value="none">
              {t('No filter')}
            </SelectItem>
            {collaborators.map((collaborator) => {
              const pictureUrl = profilePictures.get(collaborator.email);
              const avatarConfig = generateAvatarConfig(collaborator.email);

              return (
                <SelectItem className="cursor-pointer" key={collaborator.email} value={collaborator.email}>
                  <div className="flex items-center gap-2">
                    {pictureUrl ? (
                      <Image
                        src={pictureUrl}
                        alt={collaborator.name}
                        width={20}
                        height={20}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <Avatar {...avatarConfig} className="rounded-full w-5 h-5 min-w-5" />
                    )}
                    <span>{collaborator.name}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
