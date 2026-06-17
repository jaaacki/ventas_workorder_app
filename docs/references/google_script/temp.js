function findPhaseEquip() {
  const rows = Wo.WorkOrderTemp.where(r => String(r.woId || '') !== '' && String(r.phaseId || '') !== '' && r.checked === '').all()
  const phaseEquip = Wo.PhaseEquip.where(r => String(r.phaseIds || '') !== '').all()

  const normIds = v => (Array.isArray(v) ? v : String(v).split(/[,\s]+/))
    .map(x => String(x).trim())
    .filter(Boolean)

  const idx = new Map()
  phaseEquip.forEach(pe => {
    normIds(pe.phaseIds).forEach(id => {
      if (!idx.has(id)) idx.set(id, [])
      idx.get(id).push(pe.id)
    })
  })

  return rows.map(row => {
    const pid = String(row.phaseId).trim()
    const hits = idx.get(pid) || []
    const joined = hits.join(' , ')
    row.phaseEquipIds = joined
    row.checked = true
    if (typeof row.save === 'function') row.save()
    const result = { woId: row.woId, phaseId: pid, phaseEquipIds: joined }
    Logger.log(result)
    return result
  })
}
