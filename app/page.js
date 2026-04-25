'use client';

import { useState } from 'react';
import FindTab from '@/components/FindTab';
import LibraryTab from '@/components/LibraryTab';
import ImportTab from '@/components/ImportTab';
import AddTab from '@/components/AddTab';

const TABS = [
  { id: 'find', label: 'Find Videos' },
  { id: 'library', label: 'Library' },
  { id: 'import', label: 'Import' },
  { id: 'add', label: 'Add Manually' },
];

export default function Home() {
  const [tab, setTab] = useState('find');

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Video Finder Bot</h1>
          <p className="text-slate-600 text-sm mt-1">
            Pick the right founder video to send each prospect after a sales call.
          </p>
        </header>

        <nav className="flex border-b border-slate-200 mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section className="bg-white rounded-lg border border-slate-200 p-5">
          {tab === 'find' && <FindTab />}
          {tab === 'library' && <LibraryTab />}
          {tab === 'import' && <ImportTab />}
          {tab === 'add' && <AddTab />}
        </section>
      </div>
    </main>
  );
}
