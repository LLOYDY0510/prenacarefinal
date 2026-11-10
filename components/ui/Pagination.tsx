'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
  className?: string;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, 'ellipsis', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, 'ellipsis', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1 && (!totalItems || totalItems <= (itemsPerPage ?? 10))) {
    return null;
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-neutral-100 ${className}`}>
      {totalItems !== undefined && itemsPerPage !== undefined ? (
        <p className="text-xs font-semibold text-neutral-500">
          Showing <span className="text-neutral-800 font-bold">{totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to{' '}
          <span className="text-neutral-800 font-bold">{Math.min(currentPage * itemsPerPage, totalItems)}</span> of{' '}
          <span className="text-neutral-800 font-bold">{totalItems}</span> results
        </p>
      ) : (
        <p className="text-xs font-semibold text-neutral-500">
          Page <span className="text-neutral-800 font-bold">{currentPage}</span> of <span className="text-neutral-800 font-bold">{totalPages}</span>
        </p>
      )}

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          leftIcon={<ChevronLeft size={16} />}
          className="rounded-full px-2.5 sm:px-3 text-xs"
        >
          Prev
        </Button>

        {pageNumbers.map((page, idx) => {
          if (page === 'ellipsis') {
            return (
              <span key={`ellipsis-${idx}`} className="px-2 py-1 text-xs text-neutral-400 font-bold">
                …
              </span>
            );
          }

          const isActive = page === currentPage;
          return (
            <button
              key={page}
              type="button"
              onClick={() => onPageChange(page)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-w-[32px] h-8 px-2 rounded-full text-xs font-bold transition-all ${
                isActive
                  ? 'bg-[var(--brand)] text-white shadow-sm shadow-green-700/20 scale-105'
                  : 'bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/80 hover:text-neutral-900'
              }`}
            >
              {page}
            </button>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          rightIcon={<ChevronRight size={16} />}
          className="rounded-full px-2.5 sm:px-3 text-xs"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
