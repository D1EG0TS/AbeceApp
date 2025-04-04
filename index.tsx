import { useState, useEffect } from 'react';
import { View, Button, Image, StyleSheet, ActivityIndicator, FlatList, TouchableOpacity } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

const API_URL = 'http://192.168.1.105:8000/detect';

type Detection = {
  class: string;
  confidence: number;
  bbox?: number[]; // Hacer bbox opcional
};

type SavedImage = {
  id: string;
  uri: string;
  detections: Detection[];
  date: string;
};

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [viewingSaved, setViewingSaved] = useState(false);

  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        alert('Se requieren permisos para la cámara y galería');
      }
      
      // Cargar imágenes guardadas al iniciar
      loadSavedImages();
    })();
  }, []);

  const loadSavedImages = async () => {
    try {
      const dirInfo = await FileSystem.getInfoAsync(FileSystem.documentDirectory + 'detections/');
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(FileSystem.documentDirectory + 'detections/', { intermediates: true });
        return;
      }

      const savedFiles = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory + 'detections/');
      const imagesData = await Promise.all(
        savedFiles.map(async (file) => {
          try {
            const content = await FileSystem.readAsStringAsync(
              FileSystem.documentDirectory + 'detections/' + file
            );
            return JSON.parse(content);
          } catch (error) {
            console.error(`Error al leer el archivo ${file}:`, error);
            return null;
          }
        })
      );
      
      setSavedImages(imagesData.filter(Boolean));
    } catch (error) {
      console.error("Error al cargar imágenes guardadas:", error);
    }
  };

  const saveCurrentImage = async () => {
    if (!image || detections.length === 0) {
      alert('No hay detecciones para guardar');
      return;
    }
    
    try {
      const fileName = `detection_${Date.now()}.json`;
      const imageData: SavedImage = {
        id: fileName,
        uri: image,
        detections: detections,
        date: new Date().toISOString()
      };
      
      await FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + 'detections/' + fileName,
        JSON.stringify(imageData)
      );
      
      setSavedImages(prev => [...prev, imageData]);
      alert('Imagen y detecciones guardadas con éxito!');
    } catch (error) {
      console.error("Error al guardar:", error);
      alert('Error al guardar la imagen');
    }
  };

  const processImage = async (photo: ImagePicker.ImagePickerAsset) => {
    setLoading(true);
    setDetections([]);
    
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: 'photo.jpg',
        type: 'image/jpeg',
      } as any);

      const response = await axios.post<{ detections: Detection[] }>(API_URL, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      if (response.data?.detections) {
        // Filtrar detecciones válidas
        const validDetections = response.data.detections.filter(d => 
          d.class && typeof d.confidence === 'number'
        );
        setDetections(validDetections);
      } else {
        console.warn('La respuesta del servidor no tiene el formato esperado');
      }
    } catch (error) {
      console.error("Error al conectar con el servidor:", error);
      alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({ 
      quality: 0.8,
      allowsEditing: false,
      aspect: [4, 3]
    });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      processImage(result.assets[0]);
      setViewingSaved(false);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ 
      quality: 0.8,
      allowsEditing: false,
      mediaTypes: ImagePicker.MediaTypeOptions.Images
    });
    if (!result.canceled && result.assets[0]) {
      setImage(result.assets[0].uri);
      processImage(result.assets[0]);
      setViewingSaved(false);
    }
  };

  const formatBbox = (bbox?: number[]) => {
    if (!bbox || !Array.isArray(bbox)) return "No disponible";
    return `[${bbox.map(Math.round).join(', ')}]`;
  };

  const renderDetectionItem = (detection: Detection, index: number) => (
    <ThemedView key={index} style={styles.detectionItem}>
      <ThemedText>
        🏷️ {detection.class || 'Objeto no identificado'} - 
        🔍 {(detection.confidence * 100).toFixed(0)}% de confianza
      </ThemedText>
      <ThemedText style={styles.coords}>
        📌 Coordenadas: {formatBbox(detection.bbox)}
      </ThemedText>
    </ThemedView>
  );

  const renderSavedItem = ({ item }: { item: SavedImage }) => (
    <TouchableOpacity 
      style={styles.savedItem}
      onPress={() => {
        setImage(item.uri);
        setDetections(item.detections);
        setViewingSaved(false);
      }}
    >
      <Image source={{ uri: item.uri }} style={styles.thumbnail} />
      <View style={styles.savedInfo}>
        <ThemedText>
          📅 {new Date(item.date).toLocaleString()}
        </ThemedText>
        <ThemedText>
          🏷️ {item.detections.length} objeto(s) detectado(s)
        </ThemedText>
        <ThemedText style={styles.savedClasses}>
          {item.detections.slice(0, 3).map(d => d.class).join(', ')}
          {item.detections.length > 3 ? '...' : ''}
        </ThemedText>
      </View>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">AbeceApp</ThemedText>
      
      {viewingSaved ? (
        <>
          <ThemedText type="subtitle" style={styles.savedTitle}>Imágenes Guardadas</ThemedText>
          {savedImages.length > 0 ? (
            <FlatList
              data={savedImages}
              renderItem={renderSavedItem}
              keyExtractor={item => item.id}
              style={styles.savedList}
              contentContainerStyle={styles.savedListContent}
            />
          ) : (
            <ThemedView style={styles.noSavedContainer}>
              <ThemedText style={styles.noSaved}>No hay imágenes guardadas</ThemedText>
            </ThemedView>
          )}
          <Button title="Volver" onPress={() => setViewingSaved(false)} />
        </>
      ) : image ? (
        <>
          <Image source={{ uri: image }} style={styles.image} resizeMode="contain" />
          
          {loading ? (
            <ActivityIndicator size="large" style={styles.loader} />
          ) : (
            <ThemedView style={styles.results}>
              <ThemedText type="subtitle">Objetos detectados:</ThemedText>
              
              {detections.length > 0 ? (
                <>
                  <FlatList
                    data={detections}
                    renderItem={({ item, index }) => renderDetectionItem(item, index)}
                    keyExtractor={(_, index) => index.toString()}
                    style={styles.detectionsList}
                  />
                  <Button 
                    title="Guardar detección" 
                    onPress={saveCurrentImage} 
                    disabled={detections.length === 0}
                  />
                </>
              ) : (
                <ThemedText style={styles.noDetections}>No se detectaron objetos</ThemedText>
              )}
            </ThemedView>
          )}
          
          <View style={styles.buttonRow}>
            <Button title="Nueva imagen" onPress={() => setImage(null)} />
            <Button title="Ver guardadas" onPress={() => setViewingSaved(true)} />
          </View>
        </>
      ) : (
        <>
          <Button title="Tomar foto" onPress={takePhoto} />
          <View style={styles.spacer} />
          <Button title="Elegir de galería" onPress={pickFromGallery} />
          <View style={styles.spacer} />
          {savedImages.length > 0 && (
            <Button 
              title="Palabras aprendidas" 
              onPress={() => setViewingSaved(true)} 
            />
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  image: {
    width: '100%',
    height: 300,
    borderRadius: 8,
    marginVertical: 10,
    backgroundColor: '#f0f0f0',
  },
  results: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    flex: 1,
  },
  detectionItem: {
    marginVertical: 6,
    padding: 10,
    backgroundColor: '#000000',
    borderRadius: 6,
  },
  detectionsList: {
    maxHeight: 200,
    marginVertical: 10,
  },
  coords: {
    fontSize: 12,
    color: '#000000',
    marginTop: 4,
  },
  spacer: {
    height: 10,
  },
  loader: {
    marginVertical: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
    paddingVertical: 10,
  },
  savedList: {
    marginTop: 10,
    marginBottom: 20,
  },
  savedListContent: {
    paddingBottom: 20,
  },
  savedItem: {
    flexDirection: 'row',
    padding: 10,
    marginVertical: 5,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 10,
    backgroundColor: '#ddd',
  },
  savedInfo: {
    flex: 1,
  },
  savedClasses: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  savedTitle: {
    marginVertical: 15,
    textAlign: 'center',
  },
  noSavedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noSaved: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#666',
  },
  noDetections: {
    textAlign: 'center',
    marginVertical: 10,
    color: '#666',
  },
});