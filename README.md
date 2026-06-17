# 🌍 GeoWebSIG – Plataforma Web para Visualização de Geodados

> Desenvolvimento de uma Plataforma Web SIG para Visualização de Geodados: Uma Alternativa à Limitação de Infraestrutura e Softwares de Desktop.

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live-brightgreen?style=flat-square)](https://seu-usuario.github.io/web-sig-platform/)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet.js-199900?style=flat-square&logo=leaflet&logoColor=white)

---

## 📋 Sobre o Projeto

Ferramenta computacional via navegador voltada para a **visualização e inspeção de arquivos geográficos** (Shapefile, GeoJSON e GeoTIFF), desenvolvida como Monografia de Conclusão de Curso.

**Problema resolvido:** Muitos laboratórios de ensino possuem máquinas com baixo desempenho e falta de licenças de software SIG (QGIS, ArcGIS). Esta plataforma funciona **100% no navegador**, sem instalação, sem servidor, sem internet obrigatória.

---

## ✨ Funcionalidades

| Funcionalidade | Descrição |
|---|---|
| 📁 **Shapefile** | Carregamento de .shp + .dbf + .prj com reprojeção automática |
| 🗺️ **GeoJSON** | Suporte nativo, arrastar e soltar |
| 🖼️ **GeoTIFF** | Renderização de raster com rampa de cores |
| 📏 **Medir Distância** | Cálculo Haversine com multi-pontos |
| 📐 **Medir Área** | Polígono interativo com cálculo em m²/ha/km² |
| 🔍 **Atributos** | Clique em qualquer feição para ver sua tabela de dados |
| 🗄️ **Gerenciar Camadas** | Toggle, zoom, remoção por camada |
| 🌐 **Mapas Base** | OpenStreetMap, Satélite (Esri), Dark (CARTO), Topográfico |
| 📊 **Dados de Exemplo** | Regiões e capitais do Brasil pré-carregados |

---

## 🚀 Como Usar

### Opção 1: Online (GitHub Pages)
Acesse direto no navegador: `https://seu-usuario.github.io/web-sig-platform/`

### Opção 2: Local
```bash
# Clone o repositório
git clone https://github.com/seu-usuario/web-sig-platform.git

# Abra o arquivo no navegador
# Windows:
start index.html

# macOS:
open index.html

# Linux:
xdg-open index.html
```

> ⚠️ Para GeoTIFF funcionar localmente, use um servidor HTTP simples:
> ```bash
> python -m http.server 8080
> # Acesse: http://localhost:8080
> ```

---

## 📁 Carregar seus Arquivos

### Shapefile
Selecione os 3 arquivos juntos: `.shp` + `.dbf` + `.prj`

### GeoJSON
Arraste o arquivo `.geojson` ou `.json` para a área do mapa ou use o painel lateral.

### GeoTIFF
Arraste o arquivo `.tif` ou `.tiff`. Funciona melhor hospedado (GitHub Pages ou servidor local).

---

## ⌨️ Atalhos de Teclado

| Tecla | Ação |
|---|---|
| `D` | Ferramenta de Distância |
| `A` | Ferramenta de Área |
| `I` | Identificar Atributos |
| `Z` | Zoom para extensão total |
| `Esc` | Cancelar medição |

---

## 🏗️ Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| **HTML5 / CSS3** | – | Estrutura e design |
| **JavaScript** | ES2020 | Lógica client-side |
| **Leaflet.js** | 1.9.4 | Motor de mapas |
| **shapefile** | 0.6.6 | Leitura de Shapefiles |
| **georaster** | 1.6.0 | Decodificação de GeoTIFF |
| **georaster-layer-for-leaflet** | 3.10.0 | Renderização de raster |
| **proj4.js** | 2.9.0 | Reprojeção de coordenadas |
| **OpenStreetMap** | – | Mapa base (tiles) |

---

## 📊 Dados de Exemplo Incluídos

- **Regiões do Brasil** – 5 polígonos com atributos (área, população, PIB, bioma)
- **Capitais Brasileiras** – 27 pontos com atributos (estado, região, altitude, população)

Fonte: IBGE (domínio público)

---

## 🎓 Contexto Acadêmico

**Monografia:** Desenvolvimento de uma Plataforma Web SIG para Visualização de Geodados: Uma Alternativa à Limitação de Infraestrutura e Softwares de Desktop.

**Metodologia:** Desenvolvimento tecnológico experimental. A plataforma foi construída utilizando HTML5, CSS3 e JavaScript, com a biblioteca Leaflet.js como motor de mapas. O foco é criar um sistema de processamento local (client-side), garantindo que a ferramenta funcione mesmo com internet instável.

**Validação:** Testes práticos em computadores sem softwares SIG instalados, simulando a escassez de recursos das salas de aula.

---

## 📄 Licença

Este projeto foi desenvolvido para fins acadêmicos. Dados geográficos utilizados são de domínio público (IBGE).

---

*Desenvolvido com ❤️ para a Monografia de Conclusão de Curso*
