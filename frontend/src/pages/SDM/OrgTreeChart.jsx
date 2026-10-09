import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  GitFork,
  LayoutGrid,
  Plus,
  Edit3,
  RefreshCw,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronRight,
  UserCheck,
  AlertTriangle,
  Users,
  Building2,
  Layers,
  CornerDownRight,
  Hand,
} from 'lucide-react';

const KATEGORI_META = {
  direksi: {
    label: 'Direksi / Direktur Utama',
    short: 'Direktur',
    badgeClass: 'direksi',
    color: '#9333ea',
    bg: '#f3e8ff',
    border: '#d8b4fe',
  },
  direktorat: {
    label: 'Direktorat / Wadir',
    short: 'Wadir',
    badgeClass: 'direktorat',
    color: '#7c3aed',
    bg: '#ede9fe',
    border: '#c4b5fd',
  },
  bidang: {
    label: 'Bidang / Bagian (Manajer)',
    short: 'Bidang / Bagian',
    badgeClass: 'bidang',
    color: '#4f46e5',
    bg: '#e0e7ff',
    border: '#a5b4fc',
  },
  seksi: {
    label: 'Seksi / Sub-Bagian (Kasi)',
    short: 'Seksi / Sub',
    badgeClass: 'seksi',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#6ee7b7',
  },
  unit: {
    label: 'Unit / Instalasi Pelaksana',
    short: 'Unit / Instalasi',
    badgeClass: 'unit',
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#7dd3fc',
  },
};

// Recursive Single Tree Node Component
function TreeNode({
  node,
  collapsedIds,
  toggleCollapse,
  onEditUnit,
  onAddSubUnit,
  hasSdmAccess,
  searchQuery,
  depth = 0,
}) {
  const meta = KATEGORI_META[node.kategori] || KATEGORI_META.unit;
  const hasChildren = node.children && node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);

  // Check if this node matches the search query
  const isMatch = useMemo(() => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase();
    const matchName = node.nama?.toLowerCase().includes(q);
    const matchLeader = node.kepala_unit_nama?.toLowerCase().includes(q);
    return matchName || matchLeader;
  }, [node.nama, node.kepala_unit_nama, searchQuery]);

  return (
    <div className="sdm-tree-node-wrapper">
      {/* Node Card Box */}
      <div
        className={`sdm-tree-card level-${node.kategori || 'unit'} ${isMatch ? 'highlighted' : ''} ${!node.is_active ? 'inactive' : ''}`}
        id={`tree-node-${node.id}`}
      >
        {/* Top Header of Node */}
        <div className="sdm-tree-card-top">
          <span className={`sdm-org-cat-badge ${meta.badgeClass}`}>
            {meta.short}
          </span>
          <div className="sdm-tree-status">
            {node.is_active ? (
              <span className="sdm-tree-active-dot" title="Unit Aktif" />
            ) : (
              <span className="sdm-tree-inactive-tag">Non-Aktif</span>
            )}
          </div>
        </div>

        {/* Unit Name */}
        <h4 className="sdm-tree-title" title={node.nama}>
          {node.nama}
        </h4>

        {/* Leader / Approver Details */}
        <div className="sdm-tree-leader-box">
          {node.kepala_unit_nama ? (
            <div className="sdm-tree-leader-info">
              <div className="sdm-tree-leader-avatar">
                {node.kepala_unit_nama.slice(0, 2).toUpperCase()}
              </div>
              <div className="sdm-tree-leader-meta">
                <span className="sdm-tree-leader-lbl">Penanggung Jawab / Approver:</span>
                <strong className="sdm-tree-leader-name">{node.kepala_unit_nama}</strong>
              </div>
            </div>
          ) : (
            <div className="sdm-tree-leader-empty" title="Persetujuan izin akan otomatis naik ke unit induk">
              <AlertTriangle size={13} />
              <span>Pejabat belum ditentukan</span>
            </div>
          )}
        </div>

        {/* Staff Count Pill & Parent Info */}
        <div className="sdm-tree-meta-row">
          <span className="sdm-tree-staff-pill">
            <Users size={12} />
            <span>{node.user_count || 0} Anggota</span>
          </span>
          {hasChildren && (
            <span className="sdm-tree-children-count">
              <GitFork size={11} />
              <span>{node.children.length} Sub-unit</span>
            </span>
          )}
        </div>

        {/* Action Buttons for SDM / Admin */}
        {hasSdmAccess && (
          <div className="sdm-tree-actions">
            <button
              type="button"
              className="sdm-tree-btn edit"
              onClick={() => onEditUnit(node)}
              title="Edit unit dan pejabat penanggung jawab"
            >
              <Edit3 size={12} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="sdm-tree-btn add"
              onClick={() => onAddSubUnit(node.id)}
              title={`Tambah sub-unit di bawah ${node.nama}`}
            >
              <Plus size={12} />
              <span>Sub-Unit</span>
            </button>
          </div>
        )}

        {/* Branch Collapser / Expander Button */}
        {hasChildren && (
          <button
            type="button"
            className={`sdm-tree-expander-btn ${isCollapsed ? 'collapsed' : 'expanded'}`}
            onClick={() => toggleCollapse(node.id)}
            title={isCollapsed ? `Klik untuk membuka ${node.children.length} sub-unit` : 'Klik untuk menutup cabang'}
          >
            {isCollapsed ? (
              <>
                <ChevronRight size={13} />
                <span>{node.children.length} Cabang</span>
              </>
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        )}
      </div>

      {/* Children Branches (if not collapsed) */}
      {hasChildren && !isCollapsed && (
        <div className="sdm-tree-children">
          {node.children.map((child) => (
            <div key={child.id} className="sdm-tree-child-col">
              <TreeNode
                node={child}
                collapsedIds={collapsedIds}
                toggleCollapse={toggleCollapse}
                onEditUnit={onEditUnit}
                onAddSubUnit={onAddSubUnit}
                hasSdmAccess={hasSdmAccess}
                searchQuery={searchQuery}
                depth={depth + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTreeChart({
  units = [],
  onEditUnit,
  onAddSubUnit,
  onAddRootUnit,
  hasSdmAccess = false,
  onRefresh,
  loading = false,
}) {
  const [viewMode, setViewMode] = useState('tree'); // 'tree' or 'grid'
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [collapsedIds, setCollapsedIds] = useState(new Set());

  // Build the hierarchical tree data structure from flat units array
  const { roots, totalNodes, totalLeaders, emptyLeaders } = useMemo(() => {
    if (!units || units.length === 0) {
      return { roots: [], totalNodes: 0, totalLeaders: 0, emptyLeaders: 0 };
    }

    const map = new Map();
    units.forEach((u) => {
      map.set(u.id, { ...u, children: [] });
    });

    const rootsArr = [];
    let leadersCount = 0;
    let emptyCount = 0;

    // Weight ordering for levels
    const levelWeight = {
      direksi: 0,
      direktorat: 1,
      bidang: 2,
      seksi: 3,
      unit: 4,
    };

    map.forEach((node) => {
      if (node.kepala_unit) leadersCount += 1;
      else emptyCount += 1;

      if (node.parent && map.has(node.parent)) {
        map.get(node.parent).children.push(node);
      } else {
        rootsArr.push(node);
      }
    });

    // Sort children by level weight, then by name
    const sortChildren = (nodes) => {
      nodes.sort((a, b) => {
        const wa = levelWeight[a.kategori] || 99;
        const wb = levelWeight[b.kategori] || 99;
        if (wa !== wb) return wa - wb;
        return a.nama.localeCompare(b.nama);
      });
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          sortChildren(n.children);
        }
      });
    };

    sortChildren(rootsArr);

    return {
      roots: rootsArr,
      totalNodes: units.length,
      totalLeaders: leadersCount,
      emptyLeaders: emptyCount,
    };
  }, [units]);

  // Toggle Collapse of a single node
  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Expand all branches
  const handleExpandAll = () => {
    setCollapsedIds(new Set());
  };

  // Collapse all parent branches
  const handleCollapseAll = () => {
    const parentIds = new Set();
    units.forEach((u) => {
      const hasKids = units.some((k) => k.parent === u.id);
      if (hasKids) parentIds.add(u.id);
    });
    setCollapsedIds(parentIds);
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  // Drag-to-Pan (Geser kanvas dengan tahan klik kiri mouse)
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // Hanya klik kiri
    if (e.target.closest('button, input, select, a, textarea')) return;

    const container = containerRef.current;
    if (!container) return;

    dragRef.current = {
      isDown: true,
      startX: e.pageX,
      startY: e.pageY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current.isDown) return;
      const container = containerRef.current;
      if (!container) return;

      e.preventDefault();
      const dx = e.pageX - dragRef.current.startX;
      const dy = e.pageY - dragRef.current.startY;
      container.scrollLeft = dragRef.current.scrollLeft - dx;
      container.scrollTop = dragRef.current.scrollTop - dy;
    };

    const handleMouseUp = () => {
      if (dragRef.current.isDown) {
        dragRef.current.isDown = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Auto-center canvas on initial load
  useEffect(() => {
    if (units.length > 0 && containerRef.current) {
      const container = containerRef.current;
      const timer = setTimeout(() => {
        if (container.scrollWidth > container.clientWidth) {
          container.scrollTo({
            left: (container.scrollWidth - container.clientWidth) / 2,
            top: 0,
          });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [units.length]);

  const handleCenterView = () => {
    const container = containerRef.current;
    if (!container) return;
    setZoomLevel(1);
    container.scrollTo({
      left: Math.max(0, (container.scrollWidth - container.clientWidth) / 2),
      top: 0,
      behavior: 'smooth',
    });
  };

  // Auto-expand branches when searching so matching nodes are visible
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const matchingUnitIds = units
      .filter(
        (u) =>
          u.nama.toLowerCase().includes(q) ||
          (u.kepala_unit_nama && u.kepala_unit_nama.toLowerCase().includes(q))
      )
      .map((u) => u.id);

    if (matchingUnitIds.length > 0) {
      // Find all ancestor IDs for matched nodes
      const ancestorsToKeepOpen = new Set();
      const unitMap = new Map(units.map((u) => [u.id, u]));

      matchingUnitIds.forEach((id) => {
        let curr = unitMap.get(id);
        while (curr && curr.parent) {
          ancestorsToKeepOpen.add(curr.parent);
          curr = unitMap.get(curr.parent);
        }
      });

      // Remove ancestors from collapsedIds
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        ancestorsToKeepOpen.forEach((pId) => next.delete(pId));
        return next;
      });
    }
  }, [searchQuery, units]);

  return (
    <div className="sdm-org-chart-wrapper">
      {/* ── Top Header Toolbar ── */}
      <div className="sdm-org-toolbar">
        {/* Left: View Mode Toggle & Search */}
        <div className="sdm-org-toolbar-left">
          <div className="sdm-view-switcher">
            <button
              type="button"
              className={`sdm-view-btn ${viewMode === 'tree' ? 'active' : ''}`}
              onClick={() => setViewMode('tree')}
              title="Tampilkan bagan pohon hierarki"
            >
              <GitFork size={15} />
              <span>Bagan Pohon</span>
            </button>
            <button
              type="button"
              className={`sdm-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Tampilkan daftar kartu unit"
            >
              <LayoutGrid size={15} />
              <span>Daftar Kartu</span>
            </button>
          </div>

          <div className="sdm-tree-search-wrap">
            <Search size={14} className="sdm-search-icon" />
            <input
              type="text"
              className="sdm-input-search-tree"
              placeholder="Cari unit atau pejabat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="sdm-tree-search-clear"
                onClick={() => setSearchQuery('')}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Right: Actions, Zoom & Refresh */}
        <div className="sdm-org-toolbar-right">
          {viewMode === 'tree' && (
            <>
              <div className="sdm-zoom-controls">
                <button
                  type="button"
                  className="sdm-btn-zoom"
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= 0.6}
                  title="Perkecil Bagan"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  className="sdm-btn-zoom-val"
                  onClick={handleResetZoom}
                  title="Reset Zoom ke 100%"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  type="button"
                  className="sdm-btn-zoom"
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= 1.4}
                  title="Perbesar Bagan"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  className="sdm-btn-zoom"
                  onClick={handleCenterView}
                  title="Pusatkan posisi bagan (Center View)"
                >
                  <Maximize2 size={13} />
                </button>
              </div>

              <div className="sdm-pan-hint" title="Tahan klik kiri mouse lalu geser untuk memindahkan posisi bagan">
                <Hand size={13} />
                <span>Geser Bagan (Tahan Klik Kiri)</span>
              </div>

              <div className="sdm-collapse-controls">
                <button
                  type="button"
                  className="sdm-btn-soft-xs"
                  onClick={handleExpandAll}
                  title="Buka semua cabang hierarki"
                >
                  Buka Semua
                </button>
                <button
                  type="button"
                  className="sdm-btn-soft-xs"
                  onClick={handleCollapseAll}
                  title="Tutup cabang"
                >
                  Tutup Semua
                </button>
              </div>
            </>
          )}

          {hasSdmAccess && (
            <button
              type="button"
              className="sdm-btn-primary"
              onClick={onAddRootUnit}
              title="Tambah unit atau bagian baru"
            >
              <Plus size={15} />
              <span>Tambah Unit</span>
            </button>
          )}

          <button
            type="button"
            className="sdm-btn-outline"
            onClick={onRefresh}
            disabled={loading}
            title="Segarkan data unit"
          >
            <RefreshCw size={14} className={loading ? 'sdm-spin' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* ── Level Badges Legend & Summary Pill Bar ── */}
      <div className="sdm-org-legend-bar">
        <div className="sdm-legend-items">
          <span className="sdm-legend-lbl">Tingkatan Level:</span>
          <span className="sdm-legend-pill direksi">
            <span className="sdm-legend-dot" /> Direksi (Direktur)
          </span>
          <span className="sdm-legend-pill direktorat">
            <span className="sdm-legend-dot" /> Direktorat (Wadir)
          </span>
          <span className="sdm-legend-pill bidang">
            <span className="sdm-legend-dot" /> Bidang / Bagian (Manajer)
          </span>
          <span className="sdm-legend-pill seksi">
            <span className="sdm-legend-dot" /> Seksi (Kasi)
          </span>
          <span className="sdm-legend-pill unit">
            <span className="sdm-legend-dot" /> Unit Pelaksana
          </span>
        </div>

        <div className="sdm-legend-stats">
          <span>
            Total Unit: <strong>{totalNodes}</strong>
          </span>
          <span>•</span>
          <span>
            Terisi Pejabat: <strong style={{ color: '#059669' }}>{totalLeaders}</strong>
          </span>
          {emptyLeaders > 0 && (
            <>
              <span>•</span>
              <span style={{ color: '#d97706' }}>
                Kosong: <strong>{emptyLeaders}</strong>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT VIEW ── */}
      {viewMode === 'tree' ? (
        <div
          ref={containerRef}
          className={`sdm-tree-canvas-container ${isDragging ? 'is-panning' : ''}`}
          style={{
            backgroundSize: `${Math.round(24 * zoomLevel)}px ${Math.round(24 * zoomLevel)}px`,
          }}
          onMouseDown={handleMouseDown}
        >
          <div
            className="sdm-tree-canvas"
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top center',
            }}
          >
            {roots.length === 0 ? (
              <div className="sdm-empty-state" style={{ padding: '60px 20px' }}>
                <Building2 size={44} color="#94a3b8" />
                <h4 style={{ margin: '12px 0 4px', fontWeight: 800 }}>Belum Ada Data Struktur Organisasi</h4>
                <p>Silakan klik tombol <strong>Tambah Unit</strong> untuk membuat bagan struktur pertama.</p>
                {hasSdmAccess && (
                  <button
                    type="button"
                    className="sdm-btn-primary"
                    style={{ marginTop: 12 }}
                    onClick={onAddRootUnit}
                  >
                    <Plus size={15} />
                    <span>Buat Unit Tingkat Pertama</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="sdm-tree-roots-wrapper">
                {roots.map((root) => (
                  <TreeNode
                    key={root.id}
                    node={root}
                    collapsedIds={collapsedIds}
                    toggleCollapse={toggleCollapse}
                    onEditUnit={onEditUnit}
                    onAddSubUnit={onAddSubUnit}
                    hasSdmAccess={hasSdmAccess}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── ALTERNATIVE GRID / CARD VIEW ── */
        <div className="sdm-org-grid">
          {units.map((u) => (
            <div key={u.id} className="sdm-org-card">
              <div className="sdm-org-top">
                <span className={`sdm-org-cat-badge ${u.kategori || 'unit'}`}>
                  {u.kategori_label || u.kategori || 'Unit'}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: u.is_active ? '#059669' : '#94a3b8',
                    fontWeight: 700,
                  }}
                >
                  {u.is_active ? '● Aktif' : '○ Non-Aktif'}
                </span>
              </div>

              <h4 className="sdm-org-name">{u.nama}</h4>

              <div className="sdm-org-meta">
                <div>
                  Unit Induk (Parent):{' '}
                  <strong>{u.parent_nama || 'Pucuk Pimpinan / Direksi'}</strong>
                </div>
                <div>
                  Kepala / Penanggung Jawab:{' '}
                  <strong>{u.kepala_unit_nama || '(Belum Ada / Dikosongkan)'}</strong>
                </div>
                <div>
                  Jumlah Anggota Staf:{' '}
                  <strong>{u.user_count || 0} Orang</strong>
                </div>
              </div>

              {hasSdmAccess && (
                <div className="sdm-org-actions">
                  <button
                    type="button"
                    className="sdm-btn-outline"
                    onClick={() => onAddSubUnit(u.id)}
                    title={`Tambah sub-unit di bawah ${u.nama}`}
                  >
                    <Plus size={13} />
                    <span>Sub-Unit</span>
                  </button>
                  <button
                    type="button"
                    className="sdm-btn-outline"
                    onClick={() => onEditUnit(u)}
                  >
                    <Edit3 size={13} />
                    <span>Edit</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
