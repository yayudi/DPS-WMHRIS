package utils

// Map melakukan transformasi data slice bertipe T menjadi slice bertipe U.
// Sangat efisien karena menggunakan pre-allocation dan kompilasi statis (tanpa reflect).
func Map[T, U any](data []T, f func(T) U) []U {
	if data == nil {
		return nil
	}
	result := make([]U, len(data))
	for i, v := range data {
		result[i] = f(v)
	}
	return result
}

// Filter mengembalikan elemen-elemen dari slice bertipe T yang memenuhi kondisi.
func Filter[T any](data []T, predicate func(T) bool) []T {
	if data == nil {
		return nil
	}
	var result []T // tidak menggunakan pre-allocation karena jumlah akhir tidak pasti
	for _, v := range data {
		if predicate(v) {
			result = append(result, v)
		}
	}
	return result
}
