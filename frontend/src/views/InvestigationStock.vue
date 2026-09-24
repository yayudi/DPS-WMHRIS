<template>
  <div class="investigation-page p-6 bg-background min-h-screen text-text">
    <div class="w-full mx-auto">
      <!-- Header -->

      <!-- Filter Card -->
      <div class="bg-secondary/35 rounded-xl shadow-sm border border-secondary/20 p-5 mb-6">
        <h2 class="text-lg font-semibold text-text mb-4 border-b border-secondary/20 pb-2">Filter Pencarian</h2>

        <form
          @submit.prevent="fetchData"
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
        >
          <!-- Start Date -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Tanggal Mulai</label>
            <input
              type="date"
              v-model="filters.startDate"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- End Date -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Tanggal Akhir</label>
            <input
              type="date"
              v-model="filters.endDate"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- Movement Type -->
          <div class="z-50">
            <label class="block text-sm font-medium text-text/80 mb-1">Tipe Pergerakan</label>
            <TriStateSelect
              v-model="filters.movementType"
              :options="movementTypeOptions"
              placeholder="Pilih Tipe..."
              label="label"
              track-by="id"
              class="w-full"
              :class="[
                filters.movementType?.include?.length > 0 || filters.movementType?.exclude?.length > 0
                  ? 'bg-accent/5 border-accent text-accent'
                  : 'bg-background border-secondary/30 text-text/60 hover:text-text'
              ]"
            />
          </div>

          <!-- Include Notes -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Pencarian Kata (Include)</label>
            <input
              type="text"
              v-model="filters.includeNotes"
              placeholder="Contoh: Sale Ref"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="text-xs text-text/60 mt-0.5">Preset:</span>
              <button
                type="button"
                @click="filters.includeNotes = 'Sale Ref'"
                class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hover:bg-primary/20"
              >
                Sale Ref
              </button>
              <button
                type="button"
                @click="filters.includeNotes = 'Fulfilment'"
                class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hover:bg-primary/20"
              >
                Fulfilment
              </button>
              <button
                type="button"
                @click="filters.includeNotes = 'Opname'"
                class="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded hover:bg-primary/20"
              >
                Opname
              </button>
            </div>
            <p class="text-xs text-text/50 mt-1">
              Anda juga bisa menggunakan simbol `.*` jika ingin mencari dua kata terpisah. (Misal:
              <code class="bg-secondary/50 px-1 rounded">Sale.*Item</code>)
            </p>
          </div>

          <!-- Exclude Notes -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Pengecualian Kata (Exclude)</label>
            <input
              type="text"
              v-model="filters.excludeNotes"
              placeholder="Contoh: Cancelled"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="text-xs text-text/60 mt-0.5">Preset:</span>
              <button
                type="button"
                @click="filters.excludeNotes = 'Cancelled'"
                class="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded hover:bg-accent/20"
              >
                Cancelled
              </button>
              <button
                type="button"
                @click="filters.excludeNotes = 'Void'"
                class="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded hover:bg-accent/20"
              >
                Void
              </button>
            </div>
          </div>

          <!-- Kode Lokasi -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Kode Lokasi</label>
            <select
              v-model="filters.location"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            >
              <option value="">Semua Lokasi</option>
              <option v-for="loc in locationOptions" :key="loc.id" :value="loc.code">
                {{ loc.code }} {{ loc.name ? '- ' + loc.name : '' }}
              </option>
            </select>
          </div>

          <!-- Barang -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Nama / SKU Barang</label>
            <input
              type="text"
              v-model="filters.productName"
              placeholder="Cari barang..."
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- User -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Nama User</label>
            <input
              type="text"
              v-model="filters.username"
              placeholder="Nama pemroses..."
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- PL Source -->
          <div class="z-40">
            <label class="block text-sm font-medium text-text/80 mb-1">Source (Order)</label>
            <TriStateSelect
              v-model="filters.plSource"
              :options="[
                { id: 'Tokopedia', label: 'Tokopedia' },
                { id: 'Shopee', label: 'Shopee' },
                { id: 'Offline', label: 'Offline' }
              ]"
              placeholder="Pilih Source..."
              label="label"
              track-by="id"
              class="w-full"
              :class="[
                filters.plSource?.include?.length > 0 || filters.plSource?.exclude?.length > 0
                  ? 'bg-accent/5 border-accent text-accent'
                  : 'bg-background border-secondary/30 text-text/60 hover:text-text'
              ]"
            />
          </div>

          <!-- PL Status -->
          <div class="z-30">
            <label class="block text-sm font-medium text-text/80 mb-1">Status Internal Order</label>
            <TriStateSelect
              v-model="filters.plStatus"
              :options="[
                { id: 'PENDING', label: 'PENDING' },
                { id: 'VALIDATED', label: 'VALIDATED' },
                { id: 'COMPLETED', label: 'COMPLETED' },
                { id: 'CANCELLED', label: 'CANCELLED' }
              ]"
              placeholder="Pilih Status..."
              label="label"
              track-by="id"
              class="w-full"
              :class="[
                filters.plStatus?.include?.length > 0 || filters.plStatus?.exclude?.length > 0
                  ? 'bg-accent/5 border-accent text-accent'
                  : 'bg-background border-secondary/30 text-text/60 hover:text-text'
              ]"
            />
          </div>

          <!-- PL Marketplace Status -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Marketplace Status</label>
            <input
              type="text"
              v-model="filters.plMarketplaceStatus"
              placeholder="Misal: READY_TO_SHIP"
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- PL Customer -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Nama Customer</label>
            <input
              type="text"
              v-model="filters.plCustomer"
              placeholder="Cari pembeli..."
              class="w-full px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>

          <!-- Revert Status -->
          <div class="z-20">
            <label class="block text-sm font-medium text-text/80 mb-1">Status Revert</label>
            <TriStateSelect
              v-model="filters.revertStatus"
              :options="[{ id: 'REVERTED', label: 'Di-revert' }]"
              placeholder="Status Revert"
              label="label"
              track-by="id"
              class="w-full"
              :class="[
                filters.revertStatus?.include?.length > 0 || filters.revertStatus?.exclude?.length > 0
                  ? 'bg-accent/5 border-accent text-accent'
                  : 'bg-background border-secondary/30 text-text/60 hover:text-text'
              ]"
            />
          </div>

          <!-- Total Transaksi (Occurrences) -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Total Transaksi</label>
            <div class="flex space-x-2">
              <input
                type="number"
                v-model="filters.minOccurrences"
                placeholder="Min"
                min="1"
                class="w-1/2 px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <input
                type="number"
                v-model="filters.maxOccurrences"
                placeholder="Max"
                min="1"
                class="w-1/2 px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <!-- Total SKU -->
          <div>
            <label class="block text-sm font-medium text-text/80 mb-1">Total SKU</label>
            <div class="flex space-x-2">
              <input
                type="number"
                v-model="filters.minSku"
                placeholder="Min"
                min="1"
                class="w-1/2 px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <input
                type="number"
                v-model="filters.maxSku"
                placeholder="Max"
                min="1"
                class="w-1/2 px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>

          <!-- Urutkan Berdasarkan -->
          <div class="col-span-1 md:col-span-2 lg:col-span-2">
            <SegmentedControl
              label="Urutkan Berdasarkan"
              v-model="filters.sortBy"
              :options="[
                { value: 'LATEST', label: 'Waktu', icon: 'fa-solid fa-clock' },
                { value: 'OCCURRENCES', label: 'Transaksi', icon: 'fa-solid fa-list-ol' },
                { value: 'TOTAL_SKU', label: 'SKU', icon: 'fa-solid fa-boxes-stacked' },
                { value: 'TOTAL_QTY', label: 'Qty', icon: 'fa-solid fa-weight-hanging' }
              ]"
            />
          </div>

          <!-- Arah Urutan -->
          <div class="col-span-1">
            <SegmentedControl
              label="Arah Urutan"
              v-model="filters.sortDirection"
              :options="[
                { value: 'DESC', label: 'Menurun', icon: 'fa-solid fa-arrow-down-wide-short' },
                { value: 'ASC', label: 'Menaik', icon: 'fa-solid fa-arrow-up-wide-short' }
              ]"
            />
          </div>

          <!-- Exact Quantity Toggle -->
          <div class="flex items-center mt-6">
            <input
              type="checkbox"
              id="exactQtyCheck"
              v-model="filters.exactQuantity"
              class="w-4 h-4 text-primary bg-background border-secondary/30 rounded focus:ring-primary focus:ring-2"
            />
            <label for="exactQtyCheck" class="ml-2 text-sm font-medium text-text/80">
              Eksak Qty (Abaikan duplikat jika Qty berbeda)
            </label>
          </div>

          <!-- Max Time Gap -->
          <div class="mt-4">
            <label class="block text-sm font-medium text-text/80 mb-1">Maksimal Jeda (Menit)</label>
            <input
              type="number"
              v-model="filters.maxTimeGap"
              placeholder="Contoh: 5"
              min="1"
              class="w-full md:w-1/2 px-3 py-2 bg-background border border-secondary/30 text-text rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <p class="text-xs text-text/50 mt-1">
              Hanya tampilkan jika jarak antara transaksi pertama & terakhir kurang dari angka ini. Kosongkan untuk
              melihat semua.
            </p>
          </div>

          <!-- Buttons -->
          <div class="col-span-full flex justify-end space-x-3 mt-2 border-t border-secondary/20 pt-4">
            <button
              type="button"
              @click="exportToCSV"
              :disabled="loading || results.length === 0"
              class="px-4 py-2 border border-secondary/50 text-text rounded-lg hover:bg-secondary/20 transition-colors flex items-center disabled:opacity-50"
            >
              <font-awesome-icon icon="fa-solid fa-file-csv" class="mr-2" />
              Export CSV
            </button>
            <button
              type="button"
              @click="resetFilters"
              class="px-4 py-2 border border-secondary/50 text-text rounded-lg hover:bg-secondary/20 transition-colors"
            >
              Reset
            </button>
            <button
              type="submit"
              class="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors flex items-center"
              :disabled="loading"
            >
              <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin -ml-1 mr-2 h-4 w-4" />
              Cari Duplikat
            </button>
          </div>
        </form>
      </div>

      <!-- Results Data -->
      <div class="bg-secondary/50 rounded-xl shadow-sm border border-secondary/20 overflow-hidden">
        <div class="p-5 border-b border-secondary/20 flex justify-between items-center bg-primary/10">
          <h2 class="text-lg font-semibold text-text">Hasil Investigasi</h2>
          <span class="text-sm text-text/70">
            Ditemukan: <strong class="text-accent">{{ totalGroups || 0 }}</strong> grup duplikat
          </span>
        </div>

        <div v-if="loading" class="p-10 text-center text-text/50">
          <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-primary text-2xl mb-2" />
          <p>Sedang memuat data...</p>
        </div>

        <div v-else-if="results.length === 0" class="p-10 text-center text-text/50">
          <font-awesome-icon icon="fa-solid fa-search" class="mx-auto h-10 w-10 text-text/30 mb-3" />
          <p>Tidak ada transaksi ganda yang ditemukan.</p>
        </div>

        <div v-else class="overflow-x-auto">
          <div v-for="(group, idx) in results" :key="idx" class="border-b border-secondary/20 last:border-b-0">
            <div
              @click="toggleGroup(idx)"
              class="p-4 flex flex-col sm:flex-row sm:items-center justify-between cursor-pointer hover:bg-accent/10 transition-colors"
              :class="{ 'bg-accent/10': openGroups.includes(idx) }"
            >
              <div class="flex-1">
                <h3 class="font-medium text-text mt-2 break-words">{{ group.baseNote }}</h3>
                <div class="text-sm text-text/60 mt-1 flex flex-wrap gap-3">
                  <span><strong>Total Qty Movement:</strong> {{ group.totalQuantity }}</span>
                  <span class="text-text/40"> | </span>
                  <span><strong>Total Transaksi:</strong> {{ group.occurrences }}</span>
                  <span class="text-text/40"> | </span>
                  <span><strong>Total SKU:</strong> {{ group.uniqueItemsCount }}</span>
                </div>
              </div>

              <div class="text-xs flex space-x-2">
                <span
                  v-if="group.fulfilmentList"
                  class="px-2 py-1 bg-background rounded border border-secondary/30 text-text/80 text-sm font-medium"
                  >{{ group.fulfilmentList.source }}</span
                >
                <span
                  v-if="group.fulfilmentList"
                  class="px-2 py-1 bg-background rounded border border-secondary/30 text-text/80 text-sm font-medium"
                  >{{ group.fulfilmentList.status }}</span
                >
                <span
                  class="px-2 py-1 bg-background rounded border border-secondary/30 text-text/80 text-sm font-medium"
                >
                  {{ group.movementType }}
                </span>
              </div>

              <div
                class="mt-3 sm:mt-0 ml-0 sm:ml-4 flex items-center justify-center h-8 w-8 rounded-full bg-background shadow-sm border border-secondary/30"
              >
                <font-awesome-icon
                  icon="fa-solid fa-chevron-down"
                  class="text-text/60 transform transition-transform"
                  :class="{ 'rotate-180': openGroups.includes(idx) }"
                />
              </div>
            </div>

            <div
              v-show="openGroups.includes(idx)"
              class="bg-secondary/10 p-4 border-t border-secondary/20 inset-shadow"
            >
              <!-- NEW: Detail Fulfilment at Group Level -->
              <div
                v-if="group.fulfilmentList"
                class="mb-5 border border-primary/20 rounded-lg bg-background overflow-hidden shadow-sm"
              >
                <div class="p-3 text-sm grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p>
                      <span class="text-text/60 inline-block w-24">Customer:</span>
                      <strong class="text-text">{{ group.fulfilmentList.customerName || '-' }}</strong>
                    </p>
                    <p>
                      <span class="text-text/60 inline-block w-24">Shop:</span>
                      <span class="text-text">{{ group.fulfilmentList.shopName || '-' }}</span>
                    </p>
                  </div>
                  <div>
                    <p>
                      <span class="text-text/60 inline-block w-24">Order Date:</span>
                      <span class="text-text">{{ formatDate(group.fulfilmentList.orderDate) }}</span>
                    </p>
                  </div>
                </div>

                <!-- Items -->
                <div class="bg-secondary/5 border-t border-secondary/20 p-3">
                  <h5 class="text-xs font-semibold text-text/70 uppercase mb-2">Item dalam Pesanan</h5>
                  <table class="min-w-full divide-y divide-secondary/20 text-xs">
                    <thead>
                      <tr class="text-left text-text/60">
                        <th class="pb-1">SKU Asli</th>
                        <th class="pb-1">Produk (WMS)</th>
                        <th class="pb-1 text-right">Qty</th>
                        <th class="pb-1 pl-3">Status</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-secondary/10">
                      <tr
                        v-for="item in group.fulfilmentList.items"
                        :key="item.itemId"
                        class="hover:bg-secondary/10 text-text"
                      >
                        <td class="py-1">{{ item.originalSku }}</td>
                        <td class="py-1">{{ item.productName || '-' }}</td>
                        <td class="py-1 text-right">{{ item.quantity }}</td>
                        <td class="py-1 pl-3">
                          <span
                            class="px-1.5 py-0.5 rounded text-[10px]"
                            :class="
                              item.status === 'COMPLETED' ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'
                            "
                          >
                            {{ item.status }}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <h4 class="font-semibold text-text text-sm mb-3 border-b border-secondary/20 pb-2">
                Riwayat Mutasi Stok (Duplikat)
              </h4>
              <table class="min-w-full divide-y divide-secondary/20 text-sm">
                <thead>
                  <tr
                    class="text-left bg-primary/5 border-b border-secondary text-xs font-medium text-text/60 uppercase tracking-wider"
                  >
                    <th class="px-4 py-2">Waktu Eksekusi</th>
                    <th class="px-4 py-2">Lokasi</th>
                    <th class="px-4 py-2">Qty</th>
                    <th class="px-4 py-2">User</th>
                    <th class="px-4 py-2 text-right">ID Trx</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-secondary/10 bg-background rounded-lg">
                  <template v-for="skuGroup in groupTransactionsBySku(group.transactions)" :key="skuGroup.sku">
                    <!-- SKU Group Header -->
                    <tr class="bg-secondary/10 border-y border-secondary">
                      <td colspan="5" class="px-4 py-2">
                        <div class="flex items-center justify-between">
                          <div>
                            <font-awesome-icon icon="fa-solid fa-layer-group" class="mr-2 text-text/40" />
                            <span class="font-semibold text-text">{{ skuGroup.sku }}</span>
                            <span class="text-xs text-text/60 ml-2">{{ skuGroup.productName }}</span>
                          </div>
                          <!-- Root Cause Flag -->
                          <div
                            v-if="skuGroup.issueFlag === 'WORKER_DOUBLE'"
                            class="px-2 py-0.5 text-[10px] font-bold rounded bg-danger/10 text-danger border border-danger/20 flex items-center"
                            title="Akar Masalah: Worker tereksekusi dua kali pada Item ID yang sama"
                          >
                            <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-1.5" />
                            WORKER DOUBLE EXECUTION
                          </div>
                          <div
                            v-else-if="skuGroup.issueFlag === 'CART_BUG'"
                            class="px-2 py-0.5 text-[10px] font-bold rounded bg-warning/10 text-warning border border-warning/20 flex items-center"
                            title="Akar Masalah: Terdapat lebih dari 1 Item ID untuk produk yang sama (Sistem Keranjang/Webhook error)"
                          >
                            <font-awesome-icon icon="fa-solid fa-cart-arrow-down" class="mr-1.5" />
                            CART / WEBHOOK BUG
                          </div>
                        </div>
                      </td>
                    </tr>
                    <!-- Transaction Rows -->
                    <template v-for="trx in skuGroup.records" :key="trx.id">
                      <tr
                        @click="toggleTrx(trx.id)"
                        class="hover:bg-secondary/20 text-text cursor-pointer transition-colors"
                      >
                        <td class="px-4 py-2 whitespace-nowrap pl-8">
                          <font-awesome-icon
                            icon="fa-solid fa-chevron-right"
                            class="mr-2 text-text/40 transition-transform inline-block"
                            :class="{ 'rotate-90': openTrx.includes(trx.id) }"
                          />
                          {{ formatDate(trx.createdAt) }}
                        </td>
                        <td class="px-4 py-2">
                          <div class="flex items-center text-text/80">
                            <span class="truncate w-16" title="Dari Lokasi">{{ trx.fromLocationCode || '-' }}</span>
                            <font-awesome-icon
                              icon="fa-solid fa-arrow-right"
                              class="w-3 h-3 mx-1 text-text/40 flex-shrink-0"
                            />
                            <span class="truncate w-16" title="Ke Lokasi">{{ trx.toLocationCode || '-' }}</span>
                          </div>
                        </td>
                        <td
                          class="px-4 py-2 whitespace-nowrap font-medium"
                          :class="trx.quantity < 0 ? 'text-accent' : 'text-success'"
                        >
                          {{ trx.quantity }}
                        </td>
                        <td class="px-4 py-2 whitespace-nowrap">
                          {{ trx.username || `ID: ${trx.userId}` }}
                        </td>
                        <td class="px-4 py-2 whitespace-nowrap font-mono text-text/40 text-right text-xs">
                          #{{ trx.id }}
                        </td>
                      </tr>

                      <!-- Collapsible Trx Details (Item ID & Notes) -->
                      <tr v-if="openTrx.includes(trx.id)">
                        <td colspan="5" class="p-0 border-t border-secondary/10 bg-secondary/20 inset-shadow">
                          <div class="px-8 py-3 text-sm flex items-start justify-between border-l-2 border-primary/30">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
                              <div>
                                <span class="text-xs text-text/50 block mb-1">Fulfilment Item ID</span>
                                <span
                                  class="font-mono text-primary font-medium bg-primary/10 border border-primary/20 px-2 py-0.5 rounded"
                                >
                                  <font-awesome-icon icon="fa-solid fa-tag" class="mr-1 text-xs" />
                                  {{
                                    extractItemId(trx.notes) !== '-'
                                      ? '#' + extractItemId(trx.notes)
                                      : 'Tidak Terdeteksi'
                                  }}
                                </span>
                              </div>
                              <div>
                                <span class="text-xs text-text/50 block mb-1">Catatan Sistem Asli</span>
                                <span
                                  class="text-text/80 italic text-xs block break-words border-l-2 border-secondary/30 pl-2"
                                >
                                  {{ trx.notes || '-' }}
                                </span>
                              </div>
                            </div>

                            <!-- Revert Action -->
                            <div class="ml-4 flex-shrink-0 self-center">
                              <button
                                @click="confirmRevert(trx)"
                                :disabled="
                                  trx.notes && (trx.notes.includes('Reversal') || trx.notes.includes('[REVERTED]'))
                                "
                                :class="[
                                  'px-3 py-1.5 rounded border text-xs font-semibold transition-colors flex items-center',
                                  trx.notes && (trx.notes.includes('Reversal') || trx.notes.includes('[REVERTED]'))
                                    ? 'bg-secondary/20 text-text/40 border-secondary/20 cursor-not-allowed'
                                    : 'bg-accent/10 text-accent hover:bg-accent hover:text-white border-accent/30'
                                ]"
                              >
                                <font-awesome-icon icon="fa-solid fa-rotate-left" class="mr-1.5" />
                                {{
                                  trx.notes && (trx.notes.includes('Reversal') || trx.notes.includes('[REVERTED]'))
                                    ? 'Sudah Di-revert'
                                    : 'Revert Transaksi'
                                }}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <BasePagination
            v-if="paginationMeta.totalPages > 1"
            :pagination="paginationMeta"
            @changePage="changePage"
            @update:limit="changePageSize"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, onMounted } from 'vue'
import api from '@/api/axios' // Asumsi letak axios setup
import { useToast } from '@/composables/useToast.js'
import BasePagination from '@/components/ui/BasePagination.vue'
import TriStateSelect from '@/components/ui/TriStateSelect.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useMasterDataStore } from '@/stores/masterData'
import { useInvestigationFilters } from '@/composables/useInvestigationFilters'
import { useInvestigationLogic } from '@/composables/useInvestigationLogic'
import { fetchMovementTypes } from '@/api/helpers/stock.js'

const { toast } = useToast()
const locationOptions = ref([])
const movementTypeOptions = ref([])

const {
  filters,
  paginationMeta,
  results,
  loading,
  totalGroups,
  openGroups,
  openTrx,
  resetFilters,
  toggleGroup,
  toggleTrx,
  fetchData,
  changePage,
  changePageSize,
  downloadBlob
} = useInvestigationFilters()

// 2. Logic via Composable
const { formatDate, extractItemId, groupTransactionsBySku } = useInvestigationLogic()

const confirmRevert = async trx => {
  if (trx.notes && (trx.notes.includes('Reversal') || trx.notes.includes('[REVERTED]'))) return

  const isConfirmed = await swalConfirm(
    `Apakah Anda yakin ingin membalikkan transaksi stok ganda ini?\n\nID Trx: #${trx.id}\nSKU: ${trx.sku}\nQty: ${trx.quantity}\n\nSistem akan membuat transaksi baru untuk menyeimbangkan stok.`
  )

  if (isConfirmed) {
    try {
      loading.value = true
      const response = await api.post(`/investigation/revert/${trx.id}`)
      if (response.data.success) {
        toast('Transaksi berhasil di-revert', 'success')
        fetchData() // Refresh data
      } else {
        toast(response.data.message || 'Gagal revert transaksi', 'error')
      }
    } catch (error) {
      toast(error.response?.data?.message || 'Terjadi kesalahan sistem', 'error')
    } finally {
      loading.value = false
    }
  }
}

const exportToCSV = () => {
  if (results.value.length === 0) {
    toast('Tidak ada data untuk diekspor', 'warning')
    return
  }

  const headers = [
    'Invoice / Group',
    'Source',
    'PL Status',
    'Customer',
    'SKU',
    'Product Name',
    'Waktu Eksekusi',
    'Dari Lokasi',
    'Ke Lokasi',
    'Qty',
    'User',
    'ID Trx',
    'Fulfilment Item ID',
    'Catatan Asli'
  ]
  const rows = [headers]

  results.value.forEach(group => {
    group.transactions.forEach(trx => {
      rows.push(
        [
          group.baseNote,
          group.fulfilmentList?.source || '-',
          group.fulfilmentList?.status || '-',
          group.fulfilmentList?.customerName || '-',
          trx.sku,
          trx.productName,
          formatDate(trx.createdAt).replace(/,/g, ''),
          trx.fromLocationCode || '-',
          trx.toLocationCode || '-',
          trx.quantity,
          trx.username || `ID: ${trx.userId}`,
          trx.id,
          extractItemId(trx.notes),
          trx.notes
        ].map(field => `"${String(field || '').replace(/"/g, '""')}"`)
      )
    })
  })

  const csvContent = rows.map(e => e.join(',')).join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `investigasi_stok_${new Date().toISOString().slice(0, 10)}.csv`)
}

onMounted(async () => {
  try {
    const masterData = useMasterDataStore()
    const locs = await masterData.getLocations()
    // ensure locs is an array
    if (Array.isArray(locs)) {
      locationOptions.value = locs
    }
  } catch (error) {
    console.error('Failed to fetch locations', error)
  }

  try {
    const types = await fetchMovementTypes()
    movementTypeOptions.value = types.map(t => ({ id: t, label: t }))
  } catch (e) {
    console.error('Gagal load tipe pergerakan', e)
  }

  // Set default dates to last 30 days
  resetFilters()
})
</script>

<style scoped>
/* Scoped styles to keep things contained */
.inset-shadow {
  box-shadow: inset 0 2px 4px 0 rgba(0, 0, 0, 0.03);
}
</style>

