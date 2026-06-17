/* ============================================================
   sampleData.js – Dados de Exemplo para o GeoWebSIG
   Regiões do Brasil (GeoJSON simplificado) + Capitais
   Fonte: IBGE (domínio público), geometrias simplificadas
   ============================================================ */

const SAMPLE_DATA = {

  /* ── Regiões do Brasil ── */
  regioes: {
    type: "FeatureCollection",
    name: "Regiões do Brasil",
    features: [
      {
        type: "Feature",
        properties: {
          nome: "Norte",
          sigla: "N",
          area_km2: 3853327,
          populacao: 18430980,
          estados: 7,
          pib_bilhoes: 379.4,
          bioma_principal: "Amazônia",
          densidade_hab_km2: 4.78,
          capital_regional: "Manaus"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-73.99,-11.0],[-73.99,5.27],[-60.0,5.27],[-50.0,4.5],
            [-44.0,2.5],[-44.0,-1.0],[-46.0,-5.0],[-48.0,-8.0],
            [-51.0,-11.0],[-55.0,-13.0],[-60.0,-13.0],[-65.0,-11.0],
            [-68.0,-11.0],[-73.99,-11.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          nome: "Nordeste",
          sigla: "NE",
          area_km2: 1554257,
          populacao: 57374243,
          estados: 9,
          pib_bilhoes: 912.2,
          bioma_principal: "Caatinga",
          densidade_hab_km2: 36.9,
          capital_regional: "Recife"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-44.0,-1.0],[-44.0,2.5],[-37.0,4.5],[-34.0,0.0],
            [-34.8,-8.0],[-35.2,-9.5],[-38.0,-13.5],[-40.0,-15.0],
            [-42.0,-14.0],[-44.0,-10.0],[-46.0,-8.0],[-46.0,-5.0],
            [-44.0,-1.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          nome: "Centro-Oeste",
          sigla: "CO",
          area_km2: 1604852,
          populacao: 16297074,
          estados: 4,
          pib_bilhoes: 833.1,
          bioma_principal: "Cerrado",
          densidade_hab_km2: 10.16,
          capital_regional: "Brasília"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-60.0,-13.0],[-55.0,-13.0],[-51.0,-11.0],[-48.0,-8.0],
            [-46.0,-8.0],[-44.0,-10.0],[-44.0,-14.0],[-46.0,-19.0],
            [-48.0,-20.5],[-52.0,-22.0],[-54.0,-24.0],[-57.0,-23.0],
            [-58.0,-20.0],[-60.0,-16.0],[-62.0,-13.0],[-60.0,-13.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          nome: "Sudeste",
          sigla: "SE",
          area_km2: 924511,
          populacao: 89632912,
          estados: 4,
          pib_bilhoes: 4289.3,
          bioma_principal: "Mata Atlântica",
          densidade_hab_km2: 96.9,
          capital_regional: "São Paulo"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-40.0,-15.0],[-38.0,-13.5],[-40.0,-14.0],[-42.0,-14.0],
            [-44.0,-14.0],[-46.0,-19.0],[-48.0,-20.5],[-44.0,-23.5],
            [-41.0,-22.0],[-40.0,-20.5],[-39.0,-17.0],[-40.0,-15.0]
          ]]
        }
      },
      {
        type: "Feature",
        properties: {
          nome: "Sul",
          sigla: "S",
          area_km2: 576774,
          populacao: 29975984,
          estados: 3,
          pib_bilhoes: 1204.6,
          bioma_principal: "Mata Atlântica / Pampa",
          densidade_hab_km2: 51.97,
          capital_regional: "Curitiba"
        },
        geometry: {
          type: "Polygon",
          coordinates: [[
            [-48.0,-20.5],[-52.0,-22.0],[-54.0,-24.0],[-48.0,-26.0],
            [-44.0,-23.5],[-44.0,-26.0],[-48.0,-28.5],[-49.0,-33.75],
            [-53.5,-33.75],[-57.6,-30.0],[-57.5,-28.0],[-54.0,-24.0],
            [-48.0,-20.5]
          ]]
        }
      }
    ]
  },

  /* ── Capitais Brasileiras (pontos) ── */
  capitais: {
    type: "FeatureCollection",
    name: "Capitais do Brasil",
    features: [
      { type:"Feature", properties:{ nome:"Manaus",       estado:"Amazonas",       regiao:"Norte",    populacao:2255903, altitude_m:44  }, geometry:{ type:"Point", coordinates:[-60.025,-3.119] } },
      { type:"Feature", properties:{ nome:"Belém",        estado:"Pará",           regiao:"Norte",    populacao:1499641, altitude_m:13  }, geometry:{ type:"Point", coordinates:[-48.503,-1.456] } },
      { type:"Feature", properties:{ nome:"Porto Velho",  estado:"Rondônia",       regiao:"Norte",    populacao:536560,  altitude_m:96  }, geometry:{ type:"Point", coordinates:[-63.904,-8.761] } },
      { type:"Feature", properties:{ nome:"Boa Vista",    estado:"Roraima",        regiao:"Norte",    populacao:419652,  altitude_m:85  }, geometry:{ type:"Point", coordinates:[-60.673,2.819]  } },
      { type:"Feature", properties:{ nome:"Macapá",       estado:"Amapá",          regiao:"Norte",    populacao:512902,  altitude_m:15  }, geometry:{ type:"Point", coordinates:[-51.066,0.034]  } },
      { type:"Feature", properties:{ nome:"Rio Branco",   estado:"Acre",           regiao:"Norte",    populacao:413418,  altitude_m:152 }, geometry:{ type:"Point", coordinates:[-67.809,-9.974]  } },
      { type:"Feature", properties:{ nome:"Palmas",       estado:"Tocantins",      regiao:"Norte",    populacao:313432,  altitude_m:241 }, geometry:{ type:"Point", coordinates:[-48.336,-10.249] } },
      { type:"Feature", properties:{ nome:"São Luís",     estado:"Maranhão",       regiao:"Nordeste", populacao:1115932, altitude_m:28  }, geometry:{ type:"Point", coordinates:[-44.302,-2.530]  } },
      { type:"Feature", properties:{ nome:"Teresina",     estado:"Piauí",          regiao:"Nordeste", populacao:868075,  altitude_m:73  }, geometry:{ type:"Point", coordinates:[-42.802,-5.092]  } },
      { type:"Feature", properties:{ nome:"Fortaleza",    estado:"Ceará",          regiao:"Nordeste", populacao:2686612, altitude_m:21  }, geometry:{ type:"Point", coordinates:[-38.543,-3.717]  } },
      { type:"Feature", properties:{ nome:"Natal",        estado:"R. G. do Norte", regiao:"Nordeste", populacao:890480,  altitude_m:30  }, geometry:{ type:"Point", coordinates:[-35.209,-5.794]  } },
      { type:"Feature", properties:{ nome:"João Pessoa",  estado:"Paraíba",        regiao:"Nordeste", populacao:817511,  altitude_m:36  }, geometry:{ type:"Point", coordinates:[-34.863,-7.119]  } },
      { type:"Feature", properties:{ nome:"Recife",       estado:"Pernambuco",     regiao:"Nordeste", populacao:1653461, altitude_m:4   }, geometry:{ type:"Point", coordinates:[-34.881,-8.054]  } },
      { type:"Feature", properties:{ nome:"Maceió",       estado:"Alagoas",        regiao:"Nordeste", populacao:1025360, altitude_m:6   }, geometry:{ type:"Point", coordinates:[-35.735,-9.666]  } },
      { type:"Feature", properties:{ nome:"Aracaju",      estado:"Sergipe",        regiao:"Nordeste", populacao:672818,  altitude_m:4   }, geometry:{ type:"Point", coordinates:[-37.073,-10.947] } },
      { type:"Feature", properties:{ nome:"Salvador",     estado:"Bahia",          regiao:"Nordeste", populacao:2900319, altitude_m:8   }, geometry:{ type:"Point", coordinates:[-38.501,-12.971] } },
      { type:"Feature", properties:{ nome:"Brasília",     estado:"Distrito Federal",regiao:"Centro-Oeste",populacao:3094325,altitude_m:1172},geometry:{ type:"Point", coordinates:[-47.929,-15.780] } },
      { type:"Feature", properties:{ nome:"Goiânia",      estado:"Goiás",          regiao:"Centro-Oeste",populacao:1555626,altitude_m:749 },geometry:{ type:"Point", coordinates:[-49.253,-16.686] } },
      { type:"Feature", properties:{ nome:"Cuiabá",       estado:"Mato Grosso",    regiao:"Centro-Oeste",populacao:621289, altitude_m:165 },geometry:{ type:"Point", coordinates:[-56.097,-15.601] } },
      { type:"Feature", properties:{ nome:"Campo Grande", estado:"Mato Grosso do Sul",regiao:"Centro-Oeste",populacao:906092,altitude_m:532},geometry:{ type:"Point", coordinates:[-54.646,-20.469] } },
      { type:"Feature", properties:{ nome:"Belo Horizonte",estado:"Minas Gerais",  regiao:"Sudeste",  populacao:2521564, altitude_m:858 }, geometry:{ type:"Point", coordinates:[-43.937,-19.919] } },
      { type:"Feature", properties:{ nome:"Vitória",      estado:"Espírito Santo", regiao:"Sudeste",  populacao:365855,  altitude_m:4   }, geometry:{ type:"Point", coordinates:[-40.338,-20.319] } },
      { type:"Feature", properties:{ nome:"Rio de Janeiro",estado:"Rio de Janeiro",regiao:"Sudeste",  populacao:6747815, altitude_m:10  }, geometry:{ type:"Point", coordinates:[-43.196,-22.908] } },
      { type:"Feature", properties:{ nome:"São Paulo",    estado:"São Paulo",      regiao:"Sudeste",  populacao:12396372,altitude_m:760 }, geometry:{ type:"Point", coordinates:[-46.633,-23.548] } },
      { type:"Feature", properties:{ nome:"Curitiba",     estado:"Paraná",         regiao:"Sul",      populacao:1948626, altitude_m:934 }, geometry:{ type:"Point", coordinates:[-49.273,-25.428] } },
      { type:"Feature", properties:{ nome:"Florianópolis",estado:"Santa Catarina", regiao:"Sul",      populacao:537211,  altitude_m:3   }, geometry:{ type:"Point", coordinates:[-48.549,-27.596] } },
      { type:"Feature", properties:{ nome:"Porto Alegre", estado:"Rio Grande do Sul",regiao:"Sul",    populacao:1488252, altitude_m:10  }, geometry:{ type:"Point", coordinates:[-51.230,-30.034] } }
    ]
  }
};
