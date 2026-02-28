
import { Stop } from '../types';

export const parseImportedData = async (file: File): Promise<Stop[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          reject(new Error("Empty file"));
          return;
        }

        const lines = text.split(/\r\n|\n/);
        const stops: Stop[] = [];
        
        // Basic CSV parsing logic
        // Expected headers (flexible): id, city, address, lat, lng
        
        const headers = lines[0].toLowerCase().split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
        
        const latIdx = headers.findIndex(h => h.includes('lat'));
        const lngIdx = headers.findIndex(h => h.includes('lng') || h.includes('lon'));
        const addressIdx = headers.findIndex(h => h.includes('address') || h.includes('adres') || h.includes('ulica'));
        const cityIdx = headers.findIndex(h => h.includes('city') || h.includes('miasto'));
        const idIdx = headers.findIndex(h => h.includes('id'));

        if (latIdx === -1 || lngIdx === -1) {
          reject(new Error("Could not find 'lat' and 'lng' columns in CSV"));
          return;
        }

        // Start from 1 to skip header
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Handle basic CSV escaping (simple split by comma/semicolon if not quoted)
          // This is a basic parser; strict CSV parsing would require a library or complex regex
          const parts = line.split(/[,;]/).map(p => p.trim().replace(/"/g, ''));

          if (parts.length < 2) continue;

          const lat = parseFloat(parts[latIdx]);
          const lng = parseFloat(parts[lngIdx]);

          if (isNaN(lat) || isNaN(lng)) continue;

          stops.push({
            id: idIdx !== -1 ? parts[idIdx] : `imp-${i}`,
            address: addressIdx !== -1 ? parts[addressIdx] : 'Unknown Address',
            city: cityIdx !== -1 ? parts[cityIdx] : '',
            coordinates: { lat, lng },
            notes: 'Imported'
          });
        }

        resolve(stops);
      } catch (e) {
        reject(e);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
};
