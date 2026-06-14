const QRCode = require('qrcode');

class VisualizationService {
  
 
  async generateQRCode(transactionHash) {
    try {
      const verificationUrl = `${process.env.BASE_URL || 'http://localhost:8080'}/verify/${transactionHash}`;
      const qrCodeDataURL = await QRCode.toDataURL(verificationUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#2563eb',
          light: '#ffffff'
        }
      });
      return qrCodeDataURL;
    } catch (error) {
      console.error('Error generating QR code:', error);
      return null;
    }
  }

 
  generateSpendingChart(budgetData) {
    const spent = budgetData.spent || 0;
    const remaining = budgetData.remaining || budgetData.totalBudget - spent;
    
    return {
      type: 'doughnut',
      data: {
        labels: ['Spent', 'Remaining'],
        datasets: [{
          data: [spent, remaining],
          backgroundColor: [
            '#ef4444', 
            '#10b981'  
          ],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${context.label}: ₹${value.toLocaleString()} (${percentage}%)`;
              }
            }
          }
        }
      }
    };
  }

  
  generateDepartmentChart(departments) {
    return {
      type: 'bar',
      data: {
        labels: departments.map(dept => dept.name),
        datasets: [{
          label: 'Allocated Budget',
          data: departments.map(dept => dept.budget),
          backgroundColor: 'rgba(37, 99, 235, 0.8)',
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1
        }, {
          label: 'Spent',
          data: departments.map(dept => dept.spent),
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '₹' + value.toLocaleString();
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        }
      }
    };
  }

  generateSankeyData(hierarchyData) {
    const nodes = [];
    const links = [];

    // Add budget node
    nodes.push({
      id: 0,
      name: hierarchyData.name,
      type: 'budget',
      value: hierarchyData.totalBudget
    });

    let nodeIndex = 1;

  
    if (hierarchyData.departments) {
      hierarchyData.departments.forEach(dept => {
        nodes.push({
          id: nodeIndex,
          name: dept.name,
          type: 'department',
          value: dept.budget
        });

        links.push({
          source: 0,
          target: nodeIndex,
          value: dept.budget
        });

        const deptIndex = nodeIndex;
        nodeIndex++;

   
        if (dept.projects) {
          dept.projects.forEach(project => {
            nodes.push({
              id: nodeIndex,
              name: project.name,
              type: 'project',
              value: project.budget
            });

            links.push({
              source: deptIndex,
              target: nodeIndex,
              value: project.budget
            });

            const projectIndex = nodeIndex;
            nodeIndex++;

         
            if (project.vendors) {
              project.vendors.forEach(vendor => {
                nodes.push({
                  id: nodeIndex,
                  name: vendor.name,
                  type: 'vendor',
                  value: vendor.allocatedAmount
                });

                links.push({
                  source: projectIndex,
                  target: nodeIndex,
                  value: vendor.allocatedAmount
                });

                nodeIndex++;
              });
            }
          });
        }
      });
    }

    return { nodes, links };
  }

  generateTimelineChart(transactions) {
    const monthlyData = {};
    transactions.forEach(tx => {
      const month = new Date(tx.createdAt).toISOString().substring(0, 7);
      monthlyData[month] = (monthlyData[month] || 0) + tx.amount;
    });

    const months = Object.keys(monthlyData).sort();
    const amounts = months.map(month => monthlyData[month]);

    return {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'Monthly Spending',
          data: amounts,
          borderColor: 'rgba(37, 99, 235, 1)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '₹' + value.toLocaleString();
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Spending: ₹${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        }
      }
    };
  }

  generateStatusChart(items) {
    const statusCounts = {};
    items.forEach(item => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });

    const statusColors = {
      'draft': '#64748b',
      'pending': '#f59e0b',
      'approved': '#10b981',
      'rejected': '#ef4444',
      'active': '#3b82f6',
      'completed': '#06b6d4'
    };

    return {
      type: 'pie',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{
          data: Object.values(statusCounts),
          backgroundColor: Object.keys(statusCounts).map(status => statusColors[status] || '#64748b'),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true
            }
          }
        }
      }
    };
  }

  generateComparisonChart(budgets) {
    return {
      type: 'bar',
      data: {
        labels: budgets.map(budget => budget.name),
        datasets: [{
          label: 'Total Budget',
          data: budgets.map(budget => budget.totalBudget),
          backgroundColor: 'rgba(37, 99, 235, 0.8)',
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1
        }, {
          label: 'Spent',
          data: budgets.map(budget => budget.spent),
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1
        }, {
          label: 'Remaining',
          data: budgets.map(budget => budget.remaining),
          backgroundColor: 'rgba(16, 185, 129, 0.8)',
          borderColor: 'rgba(16, 185, 129, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '₹' + value.toLocaleString();
              }
            }
          }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString()}`;
              }
            }
          }
        }
      }
    };
  }
}

module.exports = new VisualizationService();
