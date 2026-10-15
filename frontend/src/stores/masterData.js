// frontend/src/stores/masterData.js
import { defineStore } from 'pinia'
import { fetchAllUsers } from '@/api/helpers/admin.js'
import { fetchAllLocations } from '@/api/helpers/stock.js'
import { fetchReportFilters } from '@/api/helpers/stats.js'
import { fetchCategories } from '@/api/helpers/categories.js'

export const useMasterDataStore = defineStore('masterData', {
  state: () => ({
    users: [],
    locations: [],
    categories: [],
    reportFilters: null,
    _usersPromise: null,
    _locationsPromise: null,
    _categoriesPromise: null,
    _filtersPromise: null
  }),

  actions: {
    /**
     * Fetch users list with cache
     * @param {boolean} forceRefresh - Bypasses cache and forces network request
     * @returns {Promise<Array>}
     */
    getUsers(forceRefresh = false) {
      // Return cached data if available
      if (this.users.length > 0 && !forceRefresh) return Promise.resolve(this.users)

      // Return ongoing promise if already fetching (prevents race conditions)
      if (this._usersPromise && !forceRefresh) return this._usersPromise

      // Start new fetch and store the promise
      this._usersPromise = fetchAllUsers()
        .then(users => {
          this.users = users
          this._usersPromise = null
          return users
        })
        .catch(err => {
          this._usersPromise = null
          throw err
        })

      return this._usersPromise
    },

    /**
     * Fetch warehouse locations with cache
     * @param {boolean} forceRefresh - Bypasses cache and forces network request
     * @returns {Promise<Array>}
     */
    getLocations(forceRefresh = false) {
      if (this.locations.length > 0 && !forceRefresh) return Promise.resolve(this.locations)
      if (this._locationsPromise && !forceRefresh) return this._locationsPromise

      this._locationsPromise = fetchAllLocations()
        .then(locs => {
          this.locations = locs
          this._locationsPromise = null
          return locs
        })
        .catch(err => {
          this._locationsPromise = null
          throw err
        })

      return this._locationsPromise
    },

    async getCategories(search = '', forceRefresh = false) {
      if (this.categories.length > 0 && !forceRefresh) return Promise.resolve(this.categories)
      if (this._categoriesPromise && !forceRefresh) return this._categoriesPromise

      this._categoriesPromise = fetchCategories(search)
        .then(categories => {
          this.categories = categories
          this._categoriesPromise = null
          return categories
        })
        .catch(err => {
          this._categoriesPromise = null
          throw err
        })

      return this._categoriesPromise
    },

    /**
     * Fetch report filters (months/years) with cache
     * @param {boolean} forceRefresh - Bypasses cache and forces network request
     * @returns {Promise<Object>}
     */
    getReportFilters(forceRefresh = false) {
      if (this.reportFilters && !forceRefresh) return Promise.resolve(this.reportFilters)
      if (this._filtersPromise && !forceRefresh) return this._filtersPromise

      this._filtersPromise = fetchReportFilters()
        .then(filters => {
          this.reportFilters = filters
          this._filtersPromise = null
          return filters
        })
        .catch(err => {
          this._filtersPromise = null
          throw err
        })

      return this._filtersPromise
    },

    /**
     * Clears all cached master data
     */
    clearCache() {
      this.users = []
      this.locations = []
      this.categories = []
      this.reportFilters = null
      this._usersPromise = null
      this._locationsPromise = null
      this._categoriesPromise = null
      this._filtersPromise = null
    }
  }
})
