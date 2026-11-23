(function () {
  'use strict';

  var streamActual = null;
  var modoCamaraActual = 'environment';
  var eventoInstalacionDiferido = null;

  var visorVideo = document.getElementById('visor-camara');
  var contenedorVisor = visorVideo.parentElement;
  var mensajeEstado = document.getElementById('mensaje-estado');
  var avisoPermiso = document.getElementById('aviso-permiso');
  var avisoLenteObjetivo = document.getElementById('aviso-lente-objetivo');

  var btnPreparar = document.getElementById('btn-preparar-camara');
  var btnConfirmar = document.getElementById('btn-confirmar-permiso');
  var btnCancelar = document.getElementById('btn-cancelar-permiso');
  var btnAlternar = document.getElementById('btn-alternar-camara');
  var btnApagar = document.getElementById('btn-apagar-camara');
  var btnInstalar = document.getElementById('btn-instalar');
  var pistaInstalacion = document.getElementById('pista-instalacion');
  var estadoInstalacion = document.getElementById('estado-instalacion');
  var toast = document.getElementById('toast');

  var temporizadorToast = null;

  function actualizarMensajeEstado(texto) {
    mensajeEstado.textContent = texto;
  }

  function mostrarToast(texto) {
    if (!toast) {
      return;
    }
    toast.textContent = texto;
    toast.hidden = false;
    if (temporizadorToast) {
      clearTimeout(temporizadorToast);
    }
    temporizadorToast = setTimeout(function () {
      toast.hidden = true;
      temporizadorToast = null;
    }, 4500);
  }

  function enModoStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches;
  }

  function instalacionRecordada() {
    try {
      return window.localStorage.getItem('pwa-instalada') === '1';
    } catch (error) {
      return false;
    }
  }

  function recordarInstalacion() {
    try {
      window.localStorage.setItem('pwa-instalada', '1');
    } catch (error) {
      /* Almacenamiento no disponible (modo privado): solo se omite el recordatorio */
    }
  }

  function marcarInstalada(mensaje) {
    recordarInstalacion();
    btnInstalar.hidden = true;
    btnInstalar.disabled = false;
    pistaInstalacion.hidden = true;
    estadoInstalacion.hidden = false;
    if (mensaje) {
      mostrarToast(mensaje);
    }
  }

  if (enModoStandalone() || instalacionRecordada()) {
    btnInstalar.hidden = true;
    pistaInstalacion.hidden = true;
    estadoInstalacion.hidden = false;
  }

  function nombreLente(modo) {
    return modo === 'environment' ? 'Trasera' : 'Frontal';
  }

  function nombreLenteMinuscula(modo) {
    return modo === 'environment' ? 'trasera' : 'frontal';
  }

  function actualizarEtiquetaAlternar() {
    btnAlternar.textContent = modoCamaraActual === 'environment'
      ? 'Cambiar a cámara frontal'
      : 'Cambiar a cámara trasera';
  }

  function mostrarControlesActivos() {
    contenedorVisor.classList.add('visor-activo');
    btnPreparar.hidden = true;
    btnAlternar.hidden = false;
    btnApagar.hidden = false;
    actualizarEtiquetaAlternar();
  }

  function mostrarControlesInactivos() {
    contenedorVisor.classList.remove('visor-activo');
    btnPreparar.hidden = false;
    btnAlternar.hidden = true;
    btnApagar.hidden = true;
  }

  function detenerCamaraActiva() {
    var habiaStream = streamActual !== null;
    if (streamActual) {
      streamActual.getTracks().forEach(function (track) {
        track.stop();
      });
      streamActual = null;
    }
    return habiaStream;
  }

  function esperar(ms) {
    return new Promise(function (resolver) {
      setTimeout(resolver, ms);
    });
  }

  function detenerStream(stream) {
    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
  }

  function lenteReportado(stream, modoPedido) {
    var pista = stream.getVideoTracks()[0];
    var ajustes = pista && pista.getSettings ? pista.getSettings() : {};
    return ajustes.facingMode || modoPedido;
  }

  function asegurarLente(stream, modo) {
    var lente = lenteReportado(stream, modo);

    if (lente === modo) {
      return Promise.resolve(stream);
    }

    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: modo } },
      audio: false
    })
      .then(function (streamExacto) {
        detenerStream(stream);
        return streamExacto;
      })
      .catch(function () {
        return stream;
      });
  }

  function activarStream(stream, modoPedido) {
    streamActual = stream;
    modoCamaraActual = lenteReportado(stream, modoPedido);
    visorVideo.srcObject = stream;
    mostrarControlesActivos();
    actualizarMensajeEstado('Cámara activa (' + nombreLente(modoCamaraActual) + '). Vista previa local, sin envío de datos.');

    return visorVideo.play().catch(function () {
      return Promise.resolve();
    });
  }

  function diagnosticarErrorCamara(error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador (icono del candado o de la cámara en la barra de direcciones) y recarga la página.');
    } else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
    } else if (error.name === 'NotReadableError') {
      actualizarMensajeEstado('La cámara está ocupada por otra aplicación. Ciérrala e inténtalo de nuevo.');
    } else if (error.name === 'AbortError') {
      actualizarMensajeEstado('El sistema canceló el arranque de la cámara. Inténtalo otra vez.');
    } else {
      actualizarMensajeEstado('Error al acceder al hardware: ' + error.message);
    }
  }

  function iniciarCamara(modo) {
    var habiaStreamActivo = detenerCamaraActiva();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      actualizarMensajeEstado('Este navegador no expone la cámara: la API getUserMedia solo funciona en contextos seguros (HTTPS o localhost).');
      return Promise.resolve();
    }

    var restricciones = {
      video: {
        facingMode: { ideal: modo },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    actualizarMensajeEstado('Solicitando permiso al sistema...');

    var esperaLiberacion = habiaStreamActivo ? esperar(220) : Promise.resolve();

    return esperaLiberacion
      .then(function () {
        return navigator.mediaDevices.getUserMedia(restricciones);
      })
      .then(function (stream) {
        return asegurarLente(stream, modo);
      })
      .then(function (stream) {
        return activarStream(stream, modo);
      })
      .catch(function (error) {
        detenerCamaraActiva();
        visorVideo.srcObject = null;
        mostrarControlesInactivos();
        diagnosticarErrorCamara(error);
        throw error;
      });
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js')
        .then(function (registro) {
          return navigator.serviceWorker.ready.then(function () {
            return registro;
          });
        })
        .then(function () {
          console.info('[PWA] Service Worker activo y controlando el ámbito de la página.');
        })
        .catch(function (error) {
          console.warn('[PWA] No se pudo registrar el Service Worker:', error);
        });
    });
  }

  window.addEventListener('beforeinstallprompt', function (event) {
    event.preventDefault();
    eventoInstalacionDiferido = event;
    btnInstalar.hidden = false;
    pistaInstalacion.hidden = true;
    if (window.matchMedia('(display-mode: standalone)').matches) {
      btnInstalar.hidden = true;
    }
  });

  btnInstalar.addEventListener('click', function () {
    if (!eventoInstalacionDiferido) {
      return;
    }
    var evento = eventoInstalacionDiferido;
    eventoInstalacionDiferido = null;
    btnInstalar.disabled = true;

    Promise.resolve()
      .then(function () {
        return evento.prompt();
      })
      .then(function () {
        return evento.userChoice;
      })
      .then(function (resultado) {
        if (resultado && resultado.outcome === 'accepted') {
          actualizarMensajeEstado('Aplicación instalada. Ábrela desde la pantalla de inicio para usarla en modo standalone.');
          marcarInstalada('Aplicación instalada correctamente.');
        } else {
          actualizarMensajeEstado('Instalación cancelada. Puedes intentarlo de nuevo desde el menú del navegador.');
          mostrarToast('Instalación cancelada.');
        }
      })
      .catch(function (error) {
        actualizarMensajeEstado('No se pudo completar la instalación: ' + error.message);
      })
      .finally(function () {
        btnInstalar.disabled = false;
      });
  });

  window.addEventListener('appinstalled', function () {
    eventoInstalacionDiferido = null;
    actualizarMensajeEstado('PWA instalada correctamente en el dispositivo.');
    marcarInstalada('Aplicación instalada correctamente.');
  });

  setTimeout(function () {
    if (!enModoStandalone() && !instalacionRecordada() && btnInstalar.hidden) {
      pistaInstalacion.hidden = false;
    }
  }, 4000);

  var consultaStandalone = window.matchMedia('(display-mode: standalone)');

  function alCambiarModoVisualizacion(evento) {
    if (evento.matches) {
      marcarInstalada('Modo aplicación instalada activo.');
    }
  }

  if (consultaStandalone.addEventListener) {
    consultaStandalone.addEventListener('change', alCambiarModoVisualizacion);
  } else if (consultaStandalone.addListener) {
    consultaStandalone.addListener(alCambiarModoVisualizacion);
  }

  btnPreparar.addEventListener('click', function () {
    avisoLenteObjetivo.textContent = nombreLenteMinuscula(modoCamaraActual);
    avisoPermiso.hidden = false;
    btnPreparar.hidden = true;
    actualizarMensajeEstado('Lee el aviso y confirma para encender la cámara.');
  });

  btnCancelar.addEventListener('click', function () {
    avisoPermiso.hidden = true;
    btnPreparar.hidden = false;
    actualizarMensajeEstado('Sin cambios. La cámara sigue apagada.');
  });

  btnConfirmar.addEventListener('click', function () {
    avisoPermiso.hidden = true;
    actualizarMensajeEstado('Esperando la respuesta del navegador...');
    iniciarCamara(modoCamaraActual).catch(function () {
      /* El diagnóstico ya se mostró en el bloque .catch de iniciarCamara */
    });
  });

  btnAlternar.addEventListener('click', function () {
    modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
    actualizarMensajeEstado('Liberando el sensor y cambiando a cámara ' + nombreLenteMinuscula(modoCamaraActual) + '...');
    iniciarCamara(modoCamaraActual).catch(function () {
      /* El diagnóstico ya se mostró en el bloque .catch de iniciarCamara */
    });
  });

  btnApagar.addEventListener('click', function () {
    detenerCamaraActiva();
    visorVideo.srcObject = null;
    mostrarControlesInactivos();
    actualizarMensajeEstado('Cámara apagada. El sensor quedó liberado.');
  });

  window.addEventListener('pagehide', function () {
    detenerCamaraActiva();
  });

  window.addEventListener('pageshow', function (evento) {
    if (evento.persisted) {
      detenerCamaraActiva();
      visorVideo.srcObject = null;
      mostrarControlesInactivos();
      actualizarMensajeEstado('La cámara está apagada. Nada se enciende hasta que tú lo autorices.');
    }
  });

  var indicadorConexion = document.getElementById('indicador-conexion');

  function actualizarConexion() {
    var enLinea = window.navigator.onLine;
    indicadorConexion.textContent = enLinea ? 'En línea' : 'Sin conexión';
    indicadorConexion.classList.toggle('pastilla-online', enLinea);
    indicadorConexion.classList.toggle('pastilla-offline', !enLinea);
  }

  window.addEventListener('online', actualizarConexion);
  window.addEventListener('offline', actualizarConexion);
  actualizarConexion();

  document.getElementById('anio-actual').textContent = new Date().getFullYear();
})();
