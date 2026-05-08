import { defineComponent, h } from 'vue';

export const IconLogout = defineComponent({
  name: 'IconLogout',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M192 512h192V320L512 192l128 128v192h192v64H640v192l-128 128-128-128V576H192v-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
