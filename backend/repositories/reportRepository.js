// backend\repositories\reportRepository.js
import db from "../config/db.js";

/**
 * Streaming Data Stok untuk Report Excel
 * Mengembalikan STREAM object, bukan promise result biasa.
 */
export const getStockReportStream = (connection, filters) => {
  let whereClauses = ["p.is_active = 1"];
  const queryParams = [];

  // Logic Filter
  switch (filters.stockStatus) {
    case "positive":
      whereClauses.push("COALESCE(sl.quantity, 0) > 0");
      break;
    case "negative":
      whereClauses.push("COALESCE(sl.quantity, 0) < 0");
      break;
    case "zero":
      whereClauses.push("COALESCE(sl.quantity, 0) = 0");
      break;
    case "all":
    default:
      break;
  }

  if (filters.building && filters.building !== "all" && filters.building.length > 0) {
    whereClauses.push("l.building IN (?)");
    queryParams.push(filters.building);
  }

  if (filters.searchQuery) {
    whereClauses.push("(p.sku LIKE ? OR p.name LIKE ?)");
    queryParams.push(`%${filters.searchQuery}%`, `%${filters.searchQuery}%`);
  }

  if (filters.purpose) {
    whereClauses.push("l.purpose = ?");
    queryParams.push(filters.purpose);
  }

  if (filters.isPackage !== null && filters.isPackage !== undefined && filters.isPackage !== "") {
    whereClauses.push("p.is_package = ?");
    queryParams.push(filters.isPackage);
  }

  const finalQuery = `
      SELECT
        p.sku AS Sku, p.name AS NamaProduk, l.code AS Lokasi,
        COALESCE(sl.quantity, 0) AS Kuantitas, p.price AS HargaSatuan,
        (COALESCE(sl.quantity, 0) * p.price) AS TotalNilai
      FROM products p
      LEFT JOIN stock_locations sl ON p.id = sl.product_id
      LEFT JOIN locations l ON sl.location_id = l.id
      WHERE ${whereClauses.join(" AND ")}
      ORDER BY p.sku, l.code;
    `;

  // Return Stream Object (Butuh akses ke raw connection mysql2)
  return connection.connection.query(finalQuery, queryParams).stream();
};

/**
 * Mengambil data opsi filter (Gedung, Purpose, Relation)
 * Fungsi ini dipindahkan dari reportService.js
 */
// export const getReportFilters = async (connection) => {
//   const [allBuildingRows] = await connection.query(
//     "SELECT DISTINCT building FROM locations WHERE building IS NOT NULL AND building != '' ORDER BY building ASC"
//   );

//   const [purposeRows] = await connection.query(
//     "SELECT DISTINCT purpose FROM locations WHERE purpose IS NOT NULL AND purpose != '' ORDER BY purpose ASC"
//   );

//   const [relationRows] = await connection.query(
//     "SELECT DISTINCT purpose, building FROM locations WHERE purpose IS NOT NULL AND building IS NOT NULL AND purpose != '' AND building != ''"
//   );

//   const buildingsByPurpose = {};
//   relationRows.forEach((row) => {
//     if (!buildingsByPurpose[row.purpose]) {
//       buildingsByPurpose[row.purpose] = [];
//     }
//     buildingsByPurpose[row.purpose].push(row.building);
//   });

//   return {
//     allBuildings: allBuildingRows.map((row) => row.building),
//     purposes: purposeRows.map((row) => row.purpose),
//     buildingsByPurpose: buildingsByPurpose,
//   };
// };

export const getReportFilters = async () => {
  let connection;
  try {
    connection = await db.getConnection();

    const [allBuildingRows] = await connection.query(
      "SELECT DISTINCT building FROM locations WHERE building IS NOT NULL AND building != '' ORDER BY building ASC"
    );

    const [purposeRows] = await connection.query(
      "SELECT DISTINCT purpose FROM locations WHERE purpose IS NOT NULL AND purpose != '' ORDER BY purpose ASC"
    );

    const [relationRows] = await connection.query(
      "SELECT DISTINCT purpose, building FROM locations WHERE purpose IS NOT NULL AND building IS NOT NULL AND purpose != '' AND building != ''"
    );

    const buildingsByPurpose = {};
    relationRows.forEach((row) => {
      if (!buildingsByPurpose[row.purpose]) {
        buildingsByPurpose[row.purpose] = [];
      }
      buildingsByPurpose[row.purpose].push(row.building);
    });

    return {
      allBuildings: allBuildingRows.map((row) => row.building),
      purposes: purposeRows.map((row) => row.purpose),
      buildingsByPurpose: buildingsByPurpose,
    };
  } catch (error) {
    console.error("Error di getReportFilters service:", error);
    throw error;
  } finally {
    if (connection) connection.release();
  }
};
