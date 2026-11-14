import React, { useEffect, useId, useRef, useState } from 'react';
import { showChoiceLabel } from '../../lib/format.js';

export function ShowSelect({ sessions, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const selectedIndex = sessions?.findIndex(item => item.id === value) ?? -1;
  const selected = selectedIndex >= 0 ? sessions[selectedIndex] : sessions?.[0];

  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open]);

  if (!sessions?.length || !selected) return null;

  const choose = index => {
    const item = sessions[index];
    if (!item) return;
    onChange(item.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onButtonKeyDown = event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(index => (index + direction + sessions.length) % sessions.length);
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(activeIndex);
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`show-select ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="show-select-button"
        ref={buttonRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${sessions[activeIndex]?.id}` : undefined}
        aria-label={label}
        onClick={() => {
          setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
          setOpen(current => !current);
        }}
        onKeyDown={onButtonKeyDown}
      >
        {showChoiceLabel(selected)}
      </button>
      {open && (
        <ul className="show-select-menu" id={listId} role="listbox" aria-label={label}>
          {sessions.map((item, index) => (
            <li
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={item.id === selected.id}
              className={index === activeIndex ? 'is-active' : ''}
              key={item.id}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(index)}
            >
              {showChoiceLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
