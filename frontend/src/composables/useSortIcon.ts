// frontend/src/compsables/useSortIcon.js
export function useSortIcon(sortByRef, sortOrderRef) {
  const getSortIcon = field => {
    const sortBy = sortByRef?.value !== undefined ? sortByRef.value : sortByRef
    const sortOrder = sortOrderRef?.value !== undefined ? sortOrderRef.value : sortOrderRef
    let isAsc = false

    if (typeof sortOrder === 'boolean') {
      isAsc = !sortOrder // If sortDesc is true, it's NOT asc (so false)
    } else if (typeof sortOrder === 'string') {
      isAsc = sortOrder.toLowerCase() === 'asc'
    }

    if (sortBy !== field) return 'fa-solid fa-sort'
    return isAsc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down'
  }

  return { getSortIcon }
}
