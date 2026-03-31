import React, { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Filter, SortAsc, MoreVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Menubar, MenubarContent, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ChatFilters } from '../../../../MessagesDashboard.types';
import styles from './ChatListHeader.module.css';

/**
 * Header component for chat list
 * Shows count, filters, and actions
 */
interface ChatListHeaderProps {
  totalCount: number;
  filteredCount: number;
  onFilterChange?: (filters: ChatFilters) => void;
  onSortChange?: (sort: 'date' | 'name' | 'unread') => void;
  currentSort?: 'date' | 'name' | 'unread';
  showActions?: boolean;
  onExport?: () => void;
  onArchiveAll?: () => void;
  onMarkAllRead?: () => void;
}

export const ChatListHeader: React.FC<ChatListHeaderProps> = ({
  totalCount,
  filteredCount,
  onFilterChange,
  onSortChange,
  currentSort = 'date',
  showActions = true,
  onExport,
  onArchiveAll,
  onMarkAllRead,
}) => {
  const t = useTranslations('messages');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<ChatFilters>({});

  const hasActiveFilters = Object.keys(filters).length > 0;
  const isFiltered = filteredCount < totalCount;

  const handleFilterApply = useCallback(() => {
    onFilterChange?.(filters);
    setIsFilterOpen(false);
  }, [filters, onFilterChange]);

  const handleFilterClear = useCallback(() => {
    setFilters({});
    onFilterChange?.({});
    setIsFilterOpen(false);
  }, [onFilterChange]);

  const handleStatusFilter = useCallback((status: 'all' | 'unread' | 'archived') => {
    setFilters(prev => ({ ...prev, status }));
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.main}>
        <div className={styles.info}>
          <h2 className={styles.title}>{t('Conversations')}</h2>
          <div className={styles.count}>
            {isFiltered ? (
              <>
                <Badge variant="secondary" className={styles.badge}>
                  {filteredCount} / {totalCount}
                </Badge>
                {hasActiveFilters && (
                  <button
                    onClick={handleFilterClear}
                    className={styles.clearButton}
                    aria-label="Clear filters"
                  >
                    ×
                  </button>
                )}
              </>
            ) : (
              <Badge variant="secondary" className={styles.badge}>
                {totalCount}
              </Badge>
            )}
          </div>
        </div>

        <div className={styles.actions}>
          {/* Filter button */}
          {onFilterChange && (
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`${styles.actionButton} ${hasActiveFilters ? styles.active : ''}`}
                  aria-label="Filter conversations"
                >
                  <Filter size={18} />
                  {hasActiveFilters && (
                    <span className={styles.filterIndicator} />
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className={styles.filterPopover} align="end">
                <div className={styles.filterContent}>
                  <h3 className={styles.filterTitle}>{t('Filter Conversations')}</h3>

                  <div className={styles.filterSection}>
                    <label className={styles.filterLabel}>{t('Status')}</label>
                    <div className={styles.filterOptions}>
                      <button
                        className={`${styles.filterOption} ${
                          !filters.status || filters.status === 'all' ? styles.selected : ''
                        }`}
                        onClick={() => handleStatusFilter('all')}
                      >
                        {t('All')}
                      </button>
                      <button
                        className={`${styles.filterOption} ${
                          filters.status === 'unread' ? styles.selected : ''
                        }`}
                        onClick={() => handleStatusFilter('unread')}
                      >
                        {t('Unread')}
                      </button>
                      <button
                        className={`${styles.filterOption} ${
                          filters.status === 'archived' ? styles.selected : ''
                        }`}
                        onClick={() => handleStatusFilter('archived')}
                      >
                        {t('Archived')}
                      </button>
                    </div>
                  </div>

                  {/* Add more filter sections as needed */}

                  <div className={styles.filterActions}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFilterClear}
                      disabled={!hasActiveFilters}
                    >
                      {t('Clear')}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleFilterApply}
                    >
                      {t('Apply')}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Sort button */}
          {onSortChange && (
            <Menubar className="flex border-0 shrink-0" style={{ boxShadow: 'none', backgroundColor: 'transparent' }}>
              <MenubarMenu>
                <MenubarTrigger className={styles.actionButton} aria-label="Sort conversations">
                  <SortAsc size={18} />
                </MenubarTrigger>
                <MenubarContent>
                  <Command>
                    <CommandList>
                      <CommandItem
                        style={{ cursor: 'pointer' }}
                        className={currentSort === 'date' ? styles.selected : ''}
                        onSelect={() => onSortChange('date')}
                      >
                        {t('Sort by Date')}
                      </CommandItem>
                      <CommandItem
                        style={{ cursor: 'pointer' }}
                        className={currentSort === 'name' ? styles.selected : ''}
                        onSelect={() => onSortChange('name')}
                      >
                        {t('Sort by Name')}
                      </CommandItem>
                      <CommandItem
                        style={{ cursor: 'pointer' }}
                        className={currentSort === 'unread' ? styles.selected : ''}
                        onSelect={() => onSortChange('unread')}
                      >
                        {t('Unread First')}
                      </CommandItem>
                    </CommandList>
                  </Command>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          )}

          {/* More actions */}
          {showActions && (onExport || onArchiveAll || onMarkAllRead) && (
            <Menubar className="flex border-0 shrink-0" style={{ boxShadow: 'none', backgroundColor: 'transparent' }}>
              <MenubarMenu>
                <MenubarTrigger className={styles.actionButton} aria-label="More actions">
                  <MoreVertical size={18} />
                </MenubarTrigger>
                <MenubarContent>
                  <Command>
                    <CommandList>
                      {onMarkAllRead && (
                        <CommandItem style={{ cursor: 'pointer' }} onSelect={onMarkAllRead}>
                          {t('Mark All as Read')}
                        </CommandItem>
                      )}
                      {onArchiveAll && (
                        <CommandItem style={{ cursor: 'pointer' }} onSelect={onArchiveAll}>
                          {t('Archive All')}
                        </CommandItem>
                      )}
                      {onExport && (
                        <CommandItem style={{ cursor: 'pointer' }} onSelect={onExport}>
                          {t('Export Conversations')}
                        </CommandItem>
                      )}
                    </CommandList>
                  </Command>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          )}
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className={styles.activeFilters}>
          <span className={styles.activeFiltersLabel}>{t('Active filters:')}</span>
          {filters.status && filters.status !== 'all' && (
            <Badge variant="outline" className={styles.filterBadge}>
              {t(`Status: ${filters.status}`)}
            </Badge>
          )}
          {/* Add more filter badges as needed */}
        </div>
      )}
    </div>
  );
};

ChatListHeader.displayName = 'ChatListHeader';