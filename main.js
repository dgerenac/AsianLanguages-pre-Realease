// Variables globales proporcionadas por el entorno de Canvas
// Estas variables permiten que tu código se conecte al entorno
// de la plataforma sin necesidad de que tú las definas manualmente.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Importaciones de Firebase
// Estos son los módulos necesarios para interactuar con la base de datos Firestore y la autenticación.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Importaciones de Chart.js
// Esto nos permite crear gráficos dinámicos para visualizar el progreso.
import Chart from 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';

// Inicializar Firebase
// Se inicializa la aplicación de Firebase con la configuración proporcionada.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
let userId = null;
let userGoals = {};
let myChart = null;

// Estructura de los objetivos del usuario
// Aquí definimos los objetivos estáticos que el usuario puede marcar.
const objectivesData = [
    { id: 'goal_listen', text: 'Try to start listening to native speakers' },
    { id: 'goal_repeat', text: 'Try to repeat after them' },
    { id: 'goal_new', text: 'More items to determine' }
];

/**
 * Autentica al usuario usando un token personalizado o de forma anónima.
 * Es crucial para acceder a la base de datos de manera segura.
 */
async function authenticate() {
    try {
        if (initialAuthToken) {
            const userCredential = await signInWithCustomToken(auth, initialAuthToken);
            userId = userCredential.user.uid;
        } else {
            const userCredential = await signInAnonymously(auth);
            userId = userCredential.user.uid;
        }
    } catch (error) {
        console.error("Authentication error:", error);
    }
}

/**
 * Renderiza los objetivos del usuario en la página.
 * Crea los elementos <li> con los botones de "Completar" y los actualiza
 * según el estado del usuario en la base de datos.
 */
const renderGoals = () => {
    const goalsContainer = document.getElementById('objectives-list');
    goalsContainer.innerHTML = '';
    
    objectivesData.forEach(goal => {
        const isCompleted = userGoals.completed && userGoals.completed[goal.id];
        const li = document.createElement('li');
        li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
        
        li.innerHTML = `
            <span>${goal.text}</span>
            <button class="btn btn-sm ${isCompleted ? 'btn-success' : 'btn-outline-secondary'}" data-goal-id="${goal.id}" ${isCompleted ? 'disabled' : ''}>
                ${isCompleted ? 'Completed!' : 'Mark as complete'}
            </button>
        `;
        goalsContainer.appendChild(li);
    });
};

/**
 * Dibuja o actualiza el gráfico de progreso.
 * Utiliza Chart.js para crear un gráfico de barras que muestra
 * qué objetivos ha completado el usuario.
 */
const renderChart = () => {
    const ctx = document.getElementById('progress-chart');
    const goalIds = objectivesData.map(goal => goal.id);
    const completedGoals = userGoals.completed || {};
    const data = goalIds.map(id => completedGoals[id] ? 1 : 0);
    const labels = objectivesData.map(goal => goal.text.split(' ')[0]);
    const totalCompleted = data.filter(d => d === 1).length;

    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Goal Progress',
            data: data,
            backgroundColor: [
                'rgba(75, 192, 192, 0.2)',
                'rgba(255, 159, 64, 0.2)',
                'rgba(54, 162, 235, 0.2)'
            ],
            borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(54, 162, 235, 1)'
            ],
            borderWidth: 1
        }]
    };

    if (myChart) {
        myChart.data = chartData;
        myChart.update();
    } else {
        myChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 1,
                        ticks: {
                            callback: function(value) {
                                return value === 1 ? 'Completed' : 'Not completed';
                            }
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `Total goals completed: ${totalCompleted} / ${objectivesData.length}`
                    }
                }
            }
        });
    }
};

/**
 * Maneja el clic en el botón de "Completar" un objetivo.
 * Actualiza el estado del objetivo en la base de datos Firestore.
 */
const handleGoalCompletion = async (event) => {
    const goalId = event.target.dataset.goalId;
    if (!goalId) return;

    try {
        // Obtenemos una referencia al documento del usuario
        const userDocRef = doc(db, `artifacts/${appId}/users/${userId}/progress`, 'userProgress');
        const updateData = {
            completed: {
                ...userGoals.completed,
                [goalId]: serverTimestamp() // Usa el timestamp del servidor para marcar la fecha de finalización
            }
        };
        // Guardamos los cambios en la base de datos
        await setDoc(userDocRef, updateData, { merge: true });
        console.log(`Goal "${goalId}" marked as completed.`);
    } catch (error) {
        console.error("Error al actualizar el objetivo:", error);
    }
};

/**
 * Inicia la aplicación y escucha los cambios en la base de datos.
 * Esta es la función principal que se ejecuta al cargar la página.
 */
async function setupApp() {
    await authenticate();
    if (!userId) {
        console.error("Authentication failed. Cannot access the database.");
        return;
    }

    // Se suscribe a los cambios en el documento de progreso del usuario en tiempo real.
    // Cada vez que el documento cambie, las funciones `renderGoals` y `renderChart`
    // se ejecutarán automáticamente para actualizar la interfaz.
    const userProgressRef = doc(db, `artifacts/${appId}/users/${userId}/progress`, 'userProgress');
    
    onSnapshot(userProgressRef, (doc) => {
        if (doc.exists()) {
            userGoals = doc.data();
        } else {
            userGoals = { completed: {} };
        }
        renderGoals();
        renderChart();
    }, (error) => {
        console.error("Error fetching user progress:", error);
    });

    // Añade el "event listener" para manejar los clics en los botones de "Completar".
    document.getElementById('objectives-list').addEventListener('click', handleGoalCompletion);
}

// Inicia la aplicación al cargar la página
window.onload = function() {
    setupApp();
}
