import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Box,
  Typography,
  Button,
  Menu,
  MenuItem,
  Stack,
  useTheme,
  useMediaQuery,
  IconButton,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
} from '@mui/material';
import {
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
  Menu as MenuIcon,
} from '@mui/icons-material';
import API from '../helpers/api';
import { usePermissions } from '../PermissionsManager';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = usePermissions();
  const theme = useTheme();

  const isDesktopLarge = useMediaQuery('(min-width:1001px)');
  const isDesktopMedium = useMediaQuery('(max-width:1000px)');
  const isMobile = useMediaQuery('(max-width:650px)');

  const hideLogoText = isDesktopMedium;
  const iconsOnly = isDesktopMedium && !isMobile;
  const empresaSoloCodigo = isDesktopMedium;

  const [activeRoute, setActiveRoute] = useState(location.pathname);
  const [user, setUser] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [selectorAnchorEl, setSelectorAnchorEl] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const navScrollRef = useRef(null);
  const openSelector = Boolean(selectorAnchorEl);

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

  useEffect(() => {
    setActiveRoute(location.pathname);
  }, [location]);

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

  const updateFade = () => {
    const el = navScrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setShowLeftFade(el.scrollLeft > 4);
    setShowRightFade(maxScrollLeft - el.scrollLeft > 4);
  };

  useEffect(() => {
    updateFade();
    window.addEventListener('resize', updateFade);
    return () => window.removeEventListener('resize', updateFade);
  }, [permissions, user, activeRoute]);

  const handleWheel = (e) => {
    if (e.deltaY !== 0 && navScrollRef.current) {
      e.preventDefault();
      navScrollRef.current.scrollLeft += e.deltaY;
      updateFade();
    }
  };

  const goTo = (path) => {
    navigate(path);
    setDrawerOpen(false);
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
    window.location.reload();
  };

  const navItems = [
    { path: '/', label: 'Inicio', icon: <HomeIcon />, visible: true },
    { path: '/PedidosScreen', label: 'Pedidos', icon: <ClipboardListIcon />, visible: permissions.canViewPedidosScreen },
    { path: '/pedidos-asignados', label: 'Asignar pedidos', icon: <TruckLoadingIcon />, visible: permissions.canViewAssignedOrders },
    { path: '/rutas', label: 'Albaranes', icon: <RouteIcon />, visible: permissions.canViewGestionRutas },
    { path: '/albaranes-asignados', label: 'Asignar albaranes', icon: <FileInvoiceIcon />, visible: permissions.canAssignWaybills },
    { path: '/traspasos', label: 'Traspaso', icon: <ExchangeAltIcon />, visible: permissions.canViewTransfers },
    { path: '/inventario', label: 'Inventario', icon: <BoxesIcon />, visible: permissions.canViewInventory },
    { path: '/recepcion-pedidos-compra', label: 'Recepción', icon: <ShoppingCartIcon />, visible: permissions.canViewInventory },
    { path: '/gestion-documental', label: 'Documentos', icon: <FileContractIcon />, visible: permissions.canViewDocumentManagement },
  ];

  const visibleNavItems = navItems.filter((item) => item.visible);
  if (visibleNavItems.length < 2) return null;

  // Renderizado para el rango de solo iconos (distribución uniforme)
  const renderIconsOnly = () => (
    <Stack
      direction="row"
      spacing={0}
      sx={{
        width: '100%',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        px: 0.5,
      }}
    >
      {visibleNavItems.map((item) => (
        <Tooltip key={item.path} title={item.label} placement="bottom">
          <Button
            startIcon={item.icon}
            onClick={() => goTo(item.path)}
            sx={{
              color: theme.palette.primary.contrastText,
              fontWeight: 600,
              minWidth: 'auto',
              flexShrink: 0,
              px: 0.8,
              py: 0.6,
              fontSize: '0rem',
              lineHeight: 1.2,
              borderRadius: 2,
              backgroundColor: activeRoute === item.path ? 'rgba(255,255,255,0.10)' : 'transparent',
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: activeRoute === item.path ? '62%' : 0,
                height: 2,
                backgroundColor: theme.palette.secondary.main,
                borderRadius: 1,
                transition: 'width 0.2s ease',
              },
              '&:hover': {
                backgroundColor: 'rgba(255,255,255,0.10)',
              },
              '& .MuiButton-startIcon': {
                marginRight: 0,
                fontSize: '1.3rem',
              },
              textTransform: 'none',
              whiteSpace: 'nowrap',
            }}
          />
        </Tooltip>
      ))}
    </Stack>
  );

  // Renderizado para el rango con texto+icono (scroll horizontal)
  const renderWithText = () => (
    <Box
      sx={{
        position: 'relative',
        display: 'inline-block',
        minWidth: 0,
        mx: 'auto',
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 32,
          background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, transparent 100%)`,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: showLeftFade ? 1 : 0,
          transition: 'opacity 0.2s',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 32,
          background: `linear-gradient(270deg, ${theme.palette.primary.main} 0%, transparent 100%)`,
          zIndex: 1,
          pointerEvents: 'none',
          opacity: showRightFade ? 1 : 0,
          transition: 'opacity 0.2s',
        },
      }}
    >
      <Box
        ref={navScrollRef}
        onScroll={updateFade}
        onWheel={handleWheel}
        sx={{
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollBehavior: 'smooth',
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            minWidth: 'max-content',
            px: 0.5,
          }}
        >
          {visibleNavItems.map((item) => (
            <Tooltip key={item.path} title={item.label} placement="bottom">
              <Button
                startIcon={item.icon}
                onClick={() => goTo(item.path)}
                sx={{
                  color: theme.palette.primary.contrastText,
                  fontWeight: 600,
                  minWidth: 'auto',
                  flexShrink: 0,
                  px: 1.2,
                  py: 0.6,
                  fontSize: '0.8rem',
                  lineHeight: 1.2,
                  borderRadius: 2,
                  backgroundColor: activeRoute === item.path ? 'rgba(255,255,255,0.10)' : 'transparent',
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: activeRoute === item.path ? '62%' : 0,
                    height: 2,
                    backgroundColor: theme.palette.secondary.main,
                    borderRadius: 1,
                    transition: 'width 0.2s ease',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.10)',
                  },
                  '& .MuiButton-startIcon': {
                    marginRight: 0.5,
                    fontSize: '1.2rem',
                  },
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </Button>
            </Tooltip>
          ))}
        </Stack>
      </Box>
    </Box>
  );

  const renderMobileDrawer = () => (
    <Drawer
      anchor="left"
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      PaperProps={{
        sx: {
          width: 280,
          backgroundColor: theme.palette.primary.dark,
          color: theme.palette.primary.contrastText,
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
          Menú
        </Typography>
        <List>
          {visibleNavItems.map((item) => (
            <ListItemButton
              key={item.path}
              onClick={() => goTo(item.path)}
              selected={activeRoute === item.path}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(255,255,255,0.15)',
                },
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.08)',
                },
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Drawer>
  );

  const empresaActual = empresas.find((e) => e.CodigoEmpresa === user?.CodigoEmpresa);
  const empresaDisplay = empresaSoloCodigo 
    ? user?.CodigoEmpresa 
    : `${user?.CodigoEmpresa} - ${empresaActual?.Empresa || 'Empresa'}`;

  return (
    <AppBar position="fixed" sx={{ boxShadow: 2, backdropFilter: 'blur(10px)' }}>
      <Toolbar
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: { xs: 48, sm: 52, md: 56 },
          px: { xs: 1, sm: 1.5, md: 2 },
          gap: { xs: 0.5, sm: 1 },
          width: '100%',
          flexWrap: 'nowrap',
        }}
      >
        {/* Logo */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onClick={() => goTo('/')}
        >
          <WarehouseIcon sx={{ mr: hideLogoText ? 0 : 0.75, fontSize: { xs: 20, sm: 22, md: 24 } }} />
          {!hideLogoText && (
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                whiteSpace: 'nowrap',
                fontSize: { xs: '0.8rem', sm: '0.9rem', md: '1rem' },
              }}
            >
              Gestión Almacén
            </Typography>
          )}
        </Box>

        {/* Bloque central */}
        <Box
          sx={{
            flexGrow: 1,
            display: 'flex',
            justifyContent: isMobile ? 'flex-end' : 'center',
            minWidth: 0,
          }}
        >
          {isMobile ? (
            <IconButton color="inherit" onClick={() => setDrawerOpen(true)}>
              <MenuIcon />
            </IconButton>
          ) : (
            iconsOnly ? renderIconsOnly() : renderWithText()
          )}
        </Box>

        {/* Selector empresa */}
        {user && (
          <>
            <Button
              onClick={handleEmpresaClick}
              endIcon={<ChevronDownIcon sx={{ fontSize: 16 }} />}
              sx={{
                color: theme.palette.primary.contrastText,
                backgroundColor: 'rgba(0,0,0,0.2)',
                borderRadius: 2,
                px: empresaSoloCodigo ? 0.8 : 1.2,
                py: 0.6,
                fontSize: empresaSoloCodigo ? '0.7rem' : '0.8rem',
                flexShrink: 0,
                textTransform: 'none',
                '&:hover': { backgroundColor: 'rgba(255,255,255,0.15)' },
              }}
            >
              <BuildingIcon sx={{ fontSize: { xs: 14, sm: 16 }, mr: 0.5 }} />
              <Box
                component="span"
                sx={{
                  maxWidth: empresaSoloCodigo ? 80 : 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {empresaDisplay}
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
        )}
      </Toolbar>
      {renderMobileDrawer()}
    </AppBar>
  );
};

export default Navbar;