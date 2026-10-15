import { jest } from '@jest/globals';
import { getStockRequirementsList } from '../../repositories/pickingRepository.js';

describe('Picking Repository - getStockRequirementsList with TriState filters', () => {
  let mockConnection;

  beforeEach(() => {
    mockConnection = {
      query: jest.fn().mockResolvedValue([
        [{ total_count: 1, total_required_qty: 10, total_stock_qty: 5, total_deficit_skus: 1, total_sufficient_skus: 0 }],
        []
      ])
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('harus memfilter source dengan format TriState include & exclude', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ total_count: 1, total_required_qty: 10, total_stock_qty: 5, total_deficit_skus: 1, total_sufficient_skus: 0 }],
      []
    ]);
    mockConnection.query.mockResolvedValueOnce([
      [
        {
          sku: 'SKU-01',
          product_id: 1,
          product_name: 'Item 1',
          total_required: 10,
          total_stock: 5,
          deficit: -5,
          status: 'DEFICIT',
          order_count: 1,
          item_count: 1,
          suggested_locations: 'A-01'
        }
      ],
      []
    ]);

    await getStockRequirementsList(mockConnection, {
      source: { include: ['Tokopedia'], exclude: ['Shopee'] },
      locationPurpose: { include: ['DISPLAY'], exclude: [] },
      page: 1,
      limit: 20
    });

    expect(mockConnection.query).toHaveBeenCalledTimes(2);

    const [summarySql, summaryParams] = mockConnection.query.mock.calls[0];
    expect(summarySql).toContain('pl.source IN (?)');
    expect(summarySql).toContain('pl.source NOT IN (?)');
    expect(summarySql).toContain('pl.location_purpose IN (?)');

    expect(summaryParams).toEqual(
      expect.arrayContaining([
        ['Tokopedia'],
        ['Shopee'],
        ['DISPLAY']
      ])
    );
  });

  it('harus mengabaikan filter saat source bernilai ALL atau string kosong', async () => {
    mockConnection.query.mockResolvedValueOnce([
      [{ total_count: 0, total_required_qty: 0, total_stock_qty: 0, total_deficit_skus: 0, total_sufficient_skus: 0 }],
      []
    ]);
    mockConnection.query.mockResolvedValueOnce([[], []]);

    await getStockRequirementsList(mockConnection, {
      source: 'ALL',
      locationPurpose: 'ALL',
      page: 1,
      limit: 20
    });

    const [summarySql] = mockConnection.query.mock.calls[0];
    expect(summarySql).not.toContain('pl.source IN');
    expect(summarySql).not.toContain('pl.location_purpose IN');
  });
});
