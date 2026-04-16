// src/components/Navbar.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Select,
  MenuItem,
  FormControl,
  Divider,
  useTheme,
  useMediaQuery,
  Menu,
  Stack,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Home as HomeIcon,
  Warehouse as WarehouseIcon,
  Route as RouteIcon,
  Assignment as ClipboardListIcon,
  LocalShipping as TruckLoadingIcon,
  SwapHoriz as ExchangeAltIcon,
  Inventory as BoxesIcon,
  Description as FileContractIcon,
  ShoppingCart as ShoppingCartIcon,
  Business as BuildingIcon,
  ExpandMore as ChevronDownIcon,
  ReceiptLong as FileInvoiceIcon,
} from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = usePermissions();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState(location.pathname);
  const [user, setUser] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [selectorAnchorEl, setSelectorAnchorEl] = useState(null);
  const openSelector = Boolean(selectorAnchorEl);

  // Usuario desde localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Ruta activa
  useEffect(() => {
    setActiveRoute(location.pathname);
  }, [location]);

  // Cerrar menú móvil si pasa a desktop
  useEffect(() => {
    if (!isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile]);

  // Cargar empresas
  useEffect(() => {
    const fetchEmpresas = async () => {
      if (!user) return;
      try {
        const { data } = await API.get('/empresas');
        setEmpresas(data);
      } catch (error) {
        console.error('Error al obtener empresas:', error);
      }
    };

    fetchEmpresas();
  }, [user]);

  const goTo = (path) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  const handleEmpresaClick = (event) => {
    setSelectorAnchorEl(event.currentTarget);
  };

  const handleEmpresaClose = () => {
    setSelectorAnchorEl(null);
  };

  const handleEmpresaChange = (empresa) => {
    const updatedUser = { ...user, CodigoEmpresa: empresa.CodigoEmpresa };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    setUser(updatedUser);
    handleEmpresaClose();
    // Recargar datos (idealmente usar un contexto global)
    window.location.reload();
  };

  const navItems = [
    { path: '/', label: 'Inicio', icon: <HomeIcon />, visible: true },
    {
      path: '/PedidosScreen',
      label: 'Todos los pedidos',
      icon: <ClipboardListIcon />,
      visible: permissions.canViewPedidosScreen,
    },
    {
      path: '/pedidos-asignados',
      label: 'Asignación de pedidos',
      icon: <TruckLoadingIcon />,
      visible: permissions.canViewAssignedOrders,
    },
    {
      path: '/rutas',
      label: 'Albaranes',
      icon: <RouteIcon />,
      visible: permissions.canViewGestionRutas,
    },
    {
      path: '/albaranes-asignados',
      label: 'Asignación de albaranes',
      icon: <FileInvoiceIcon />,
      visible: permissions.canAssignWaybills,
    },
    {
      path: '/traspasos',
      label: 'Traspaso',
      icon: <ExchangeAltIcon />,
      visible: permissions.canViewTransfers,
    },
    {
      path: '/inventario',
      label: 'Inventario',
      icon: <BoxesIcon />,
      visible: permissions.canViewInventory,
    },
    {
      path: '/recepcion-pedidos-compra',
      label: 'Recepción Pedidos Compra',
      icon: <ShoppingCartIcon />,
      visible: permissions.canViewInventory,
    },
    {
      path: '/gestion-documental',
      label: 'Gestión Documental',
      icon: <FileContractIcon />,
      visible: permissions.canViewDocumentManagement,
    },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);
  if (visibleNavItems.length < 2) return null;

  // Desktop navigation: botones más compactos verticalmente pero con separación horizontal
  const desktopNav = (
    <Stack
      direction="row"
      spacing={0.5} // separación entre botones
      sx={{
        flexGrow: 1,
        justifyContent: 'center',
        overflowX: 'auto',
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      {visibleNavItems.map((item) => (
        <Button
          key={item.path}
          startIcon={item.icon}
          onClick={() => goTo(item.path)}
          sx={{
            color: theme.palette.primary.contrastText,
            fontWeight: activeRoute === item.path ? 600 : 400,
            minWidth: 'auto',
            px: 1.5,
            py: 0.75,
            fontSize: '0.8rem',
            position: 'relative',
            '&::after': activeRoute === item.path
              ? {
                  content: '""',
                  position: 'absolute',
                  bottom: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '60%',
                  height: 2,
                  backgroundColor: theme.palette.secondary.main,
                  borderRadius: 1,
                }
              : {},
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            },
            textTransform: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </Button>
      ))}
    </Stack>
  );

  // Selector de empresa en desktop (compacto)
  const empresaSelectorDesktop = user && (
    <>
      <Button
        onClick={handleEmpresaClick}
        endIcon={<ChevronDownIcon sx={{ fontSize: 18 }} />}
        sx={{
          color: theme.palette.primary.contrastText,
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderRadius: 1,
          px: 1.5,
          py: 0.75,
          fontSize: '0.8rem',
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.15)' },
        }}
      >
        <BuildingIcon sx={{ fontSize: 16, mr: 0.5 }} />
        <Box component="span" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {user.CodigoEmpresa} - {empresas.find(e => e.CodigoEmpresa === user.CodigoEmpresa)?.Empresa?.substring(0, 20) || 'Empresa'}
        </Box>
      </Button>
      <Menu
        anchorEl={selectorAnchorEl}
        open={openSelector}
        onClose={handleEmpresaClose}
        PaperProps={{
          sx: {
            maxHeight: 300,
            width: 250,
            backgroundColor: theme.palette.primary.dark,
            color: theme.palette.primary.contrastText,
          },
        }}
      >
        {empresas.map((empresa) => (
          <MenuItem
            key={empresa.CodigoEmpresa}
            onClick={() => handleEmpresaChange(empresa)}
            selected={empresa.CodigoEmpresa === user.CodigoEmpresa}
            sx={{
              flexDirection: 'column',
              alignItems: 'flex-start',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              '&:last-child': { borderBottom: 'none' },
              py: 1,
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              {empresa.CodigoEmpresa}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {empresa.Empresa}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
    </>
  );

  // Mobile drawer con diseño limpio
  const mobileDrawer = (
    <Drawer
      anchor="right"
      open={isMobileMenuOpen}
      onClose={() => setIsMobileMenuOpen(false)}
      PaperProps={{
        sx: {
          width: 280,
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
        },
      }}
    >
      <Box sx={{ p: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
        <IconButton onClick={() => setIsMobileMenuOpen(false)} sx={{ color: 'inherit' }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <List sx={{ pt: 0 }}>
        {visibleNavItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              onClick={() => goTo(item.path)}
              selected={activeRoute === item.path}
              sx={{
                py: 1.2,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.2)',
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500, fontSize: '0.95rem' }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />

      {user && (
        <Box sx={{ p: 2, mt: 'auto' }}>
          <FormControl fullWidth size="small" variant="outlined">
            <Select
              value={user.CodigoEmpresa || ''}
              onChange={(e) =>
                handleEmpresaChange({
                  CodigoEmpresa: parseInt(e.target.value, 10),
                })
              }
              sx={{
                color: 'inherit',
                backgroundColor: 'rgba(0,0,0,0.2)',
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.6)' },
                '& .MuiSvgIcon-root': { color: 'inherit' },
              }}
            >
              {empresas.map((empresa) => (
                <MenuItem
                  key={empresa.CodigoEmpresa}
                  value={empresa.CodigoEmpresa}
                  sx={{ whiteSpace: 'normal', py: 1 }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {empresa.CodigoEmpresa}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {empresa.Empresa}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}
    </Drawer>
  );

  return (
    <AppBar position="fixed" sx={{ boxShadow: 2 }}>
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: { xs: 48, sm: 56 }, // más compacto
          px: { xs: 1.5, sm: 2 },
        }}
      >
        {/* Logo / Brand - más pequeño */}
        <Box
          sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          onClick={() => goTo('/')}
        >
          <WarehouseIcon sx={{ mr: 0.5, fontSize: { xs: 22, sm: 24 } }} />
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 600,
              letterSpacing: 0.5,
              whiteSpace: 'nowrap',
              fontSize: { xs: '0.9rem', sm: '1rem' },
            }}
          >
            Gestión Almacén
          </Typography>
        </Box>

        {/* Desktop Navigation */}
        {!isMobile && desktopNav}

        {/* Right side: empresa selector (desktop) + mobile menu button */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {!isMobile && empresaSelectorDesktop}
          {isMobile && (
            <IconButton
              onClick={() => setIsMobileMenuOpen(true)}
              sx={{ color: theme.palette.primary.contrastText, p: 0.5 }}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Box>
      </Toolbar>

      {mobileDrawer}
    </AppBar>
  );
};

export default Navbar;